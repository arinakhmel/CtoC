import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestRouter, providerFuture } from '../src/app/router';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const apiError = (code: string, status: number) => json({ error: { code, message: 'x' } }, status);

const file = (id: string, name: string) => ({ id, name, mime: 'application/pdf', sizeBytes: 2048, createdAt: '2026-11-12T10:00:00.000Z' });
const result = (status: string, files: unknown[]) => ({
  result: { version: 1, status, revisionComment: null, submittedAt: '2026-11-13T10:00:00.000Z', files },
});
const ACCEPTED_BODY = {
  task: { id: 't1', status: 'done', completedAt: '2026-11-14T10:00:00.000Z' },
  payout: { grossKopecks: 50_000, commissionKopecks: 5_000, netKopecks: 45_000 },
  experienceRecordId: 'x1',
};

let taskStatus: string;
let current: { result: unknown };
let acceptAnswer: () => Response | Promise<Response>;
let accepts: number;

beforeEach(() => {
  taskStatus = 'in_review';
  current = result('submitted', [file('f1', 'logo.pdf'), file('f2', 'brief.pdf')]);
  accepts = 0;
  acceptAnswer = () => {
    taskStatus = 'done';
    current = result('accepted', [file('f1', 'logo.pdf'), file('f2', 'brief.pdf')]);
    return json(ACCEPTED_BODY);
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/tasks/t1/applications') {
        return json({
          task: { id: 't1', title: 'Логотип для кав’ярні', status: taskStatus, priceKopecks: 50_000, deadlineAt: '2030-05-20T15:30:00.000Z', hasExecutor: true },
          applications: [],
        });
      }
      if (url === '/api/tasks/t1/accept' && init?.method === 'POST') {
        accepts += 1;
        return acceptAnswer();
      }
      if (url === '/api/tasks/t1/result') return json(current);
      if (url === '/api/tasks/t1/messages') return json({ messages: [] });
      return json({ status: 'ok' });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const openPage = () => render(<RouterProvider router={createTestRouter(['/c/tasks/t1'])} future={providerFuture} />);
const acceptButton = () => screen.findByRole('button', { name: 'Прийняти результат' });

describe('/c/tasks/:id «Прийняти результат» (US-31)', () => {
  it('US-31 sc.1 the owner sees the files that were sent as download links and the button «Прийняти результат»', async () => {
    openPage();

    const list = await screen.findByRole('list', { name: 'Файли результату' });
    expect(within(list).getByRole('link', { name: 'logo.pdf' })).toHaveAttribute('href', '/api/files/f1');
    expect(within(list).getByRole('link', { name: 'brief.pdf' })).toHaveAttribute('href', '/api/files/f2');
    expect(await acceptButton()).toBeEnabled();
    expect(screen.getByText('На перевірці')).toBeInTheDocument();
  });

  it('US-31 sc.1 pressing it only asks: «Підтвердити» and «Скасувати» appear and nothing is sent yet', async () => {
    openPage();

    await userEvent.click(await acceptButton());

    const group = await screen.findByRole('group', { name: 'Підтвердження прийняття результату' });
    expect(within(group).getByRole('button', { name: 'Підтвердити' })).toBeInTheDocument();
    expect(within(group).getByRole('button', { name: 'Скасувати' })).toBeInTheDocument();
    expect(accepts).toBe(0);
    expect(screen.queryByRole('button', { name: 'Прийняти результат' })).not.toBeInTheDocument();
  });

  it('US-31 sc.1 «Скасувати» closes the question, sends nothing, and the button is back', async () => {
    openPage();
    await userEvent.click(await acceptButton());

    await userEvent.click(await screen.findByRole('button', { name: 'Скасувати' }));

    expect(await acceptButton()).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Підтвердження прийняття результату' })).not.toBeInTheDocument();
    expect(accepts).toBe(0);
  });

  it('US-31 sc.1 «Підтвердити» accepts: one request, the status «Виконано», the amount paid is shown, the button is gone', async () => {
    openPage();
    await userEvent.click(await acceptButton());

    await userEvent.click(await screen.findByRole('button', { name: 'Підтвердити' }));

    expect(await screen.findByText(/Результат прийнято\. Студенту нараховано 450 грн/)).toHaveAttribute('role', 'status');
    expect(accepts).toBe(1);
    expect(await screen.findByText('Виконано')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Прийняти результат' })).not.toBeInTheDocument());
    expect(screen.queryByRole('group', { name: 'Підтвердження прийняття результату' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'logo.pdf' })).toBeInTheDocument(); // the files stay as links
  });

  it('US-31 a double click on «Підтвердити» sends one request: the buttons are off while it runs', async () => {
    let release: (response: Response) => void = () => undefined;
    acceptAnswer = () =>
      new Promise<Response>((resolve) => {
        release = resolve;
      });
    openPage();
    await userEvent.click(await acceptButton());
    const confirm = await screen.findByRole('button', { name: 'Підтвердити' });

    await userEvent.click(confirm);
    await waitFor(() => expect(confirm).toBeDisabled());
    expect(screen.getByRole('button', { name: 'Скасувати' })).toBeDisabled();
    await userEvent.click(confirm);
    expect(accepts).toBe(1);

    taskStatus = 'done';
    release(json(ACCEPTED_BODY));
    expect(await screen.findByText('Виконано')).toBeInTheDocument();
    expect(accepts).toBe(1);
  });
});

describe('/c/tasks/:id a deal that is already closed (US-31 sc.3)', () => {
  it('US-31 sc.3 a task that is done has no «Прийняти результат» and says the deal is closed; the files can still be downloaded', async () => {
    taskStatus = 'done';
    current = result('accepted', [file('f1', 'logo.pdf')]);
    openPage();

    expect(await screen.findByText('Угоду завершено: результат прийнято, виплату студенту нараховано.')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'logo.pdf' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Прийняти результат' })).not.toBeInTheDocument();
    expect(screen.getByText('Виконано')).toBeInTheDocument();
  });

  it('US-31 sc.3 if it was accepted in another tab the server says 409 TASK_ALREADY_DONE: «Угоду вже завершено», and the page shows the real status', async () => {
    acceptAnswer = () => {
      taskStatus = 'done'; // the other tab was first
      return apiError('TASK_ALREADY_DONE', 409);
    };
    openPage();
    await userEvent.click(await acceptButton());

    await userEvent.click(await screen.findByRole('button', { name: 'Підтвердити' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Угоду вже завершено');
    expect(await screen.findByText('Виконано')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Прийняти результат' })).not.toBeInTheDocument());
  });
});

describe('/c/tasks/:id other answers and states (US-31)', () => {
  it('a 409 TASK_NOT_IN_REVIEW is shown and the page fetches the task again (it was sent back, so there is nothing to accept)', async () => {
    acceptAnswer = () => {
      taskStatus = 'revision';
      return apiError('TASK_NOT_IN_REVIEW', 409);
    };
    openPage();
    await userEvent.click(await acceptButton());

    await userEvent.click(await screen.findByRole('button', { name: 'Підтвердити' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Немає результату на перевірці');
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Прийняти результат' })).not.toBeInTheDocument());
  });

  it('US-31 sc.2 a 403 NOT_TASK_OWNER is shown as «Доступ заборонено» and nothing else changes', async () => {
    acceptAnswer = () => apiError('NOT_TASK_OWNER', 403);
    openPage();
    await userEvent.click(await acceptButton());

    await userEvent.click(await screen.findByRole('button', { name: 'Підтвердити' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Доступ заборонено');
    expect(screen.getByText('На перевірці')).toBeInTheDocument();
  });

  it('a lost connection is shown, the question closes, and the button is there to try again', async () => {
    acceptAnswer = () => {
      throw new TypeError('network down');
    };
    openPage();
    await userEvent.click(await acceptButton());

    await userEvent.click(await screen.findByRole('button', { name: 'Підтвердити' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Немає зв’язку із сервером');
    expect(await acceptButton()).toBeInTheDocument();
    expect(screen.getByText('На перевірці')).toBeInTheDocument();
  });

  it.each(['published', 'in_progress'])('a task in %s has no result block and no «Прийняти результат»', async (status) => {
    taskStatus = status;
    openPage();

    expect(await screen.findByRole('heading', { level: 1, name: 'Логотип для кав’ярні' })).toBeInTheDocument();
    await screen.findByRole('heading', { name: 'Відгуки студентів' });
    expect(screen.queryByRole('heading', { name: 'Результат виконавця' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Прийняти результат' })).not.toBeInTheDocument();
  });
});

describe('/c/tasks/:id a task that was sent back (the return itself is US-32)', () => {
  it('in revision the block shows the version that was sent back, without «Прийняти результат»', async () => {
    taskStatus = 'revision';
    current = result('returned', [file('f1', 'logo.pdf')]);
    openPage();

    expect(await screen.findByRole('heading', { name: 'Результат виконавця' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'logo.pdf' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Прийняти результат' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Угоду завершено/)).not.toBeInTheDocument();
  });
});
