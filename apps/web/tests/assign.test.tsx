import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestRouter, providerFuture } from '../src/app/router';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const apiError = (code: string, status: number) => json({ error: { code, message: 'x' } }, status);

const who = (id: string, displayName: string) => ({ id, displayName, verified: true, skills: [] as string[], bio: '' });
const candidate = (id: string, student: ReturnType<typeof who>, status: string) => ({
  id,
  taskId: 't1',
  status,
  note: null,
  createdAt: '2026-11-12T09:15:00.000Z',
  student,
});

let taskStatus: string;
let applications: ReturnType<typeof candidate>[];
let assignResponse: (() => Response) | null;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  taskStatus = 'published';
  applications = [candidate('a1', who('u1', 'Олена Коваль'), 'sent'), candidate('a2', who('u2', 'Петро Іваненко'), 'sent')];
  assignResponse = null;
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/tasks/t1/assign' && init?.method === 'POST') {
      if (assignResponse) return assignResponse();
      const { applicationId } = JSON.parse(String(init.body)) as { applicationId: string };
      taskStatus = 'in_progress';
      applications = applications.map((a) => ({ ...a, status: a.id === applicationId ? 'accepted' : 'rejected' }));
      return json({
        task: { id: 't1', status: 'in_progress', executorId: 'u1', priceKopecks: 50_000 },
        escrow: { id: 'e1', status: 'held', amountKopecks: 50_000 },
        applications: { accepted: applicationId, rejectedCount: 1 },
      });
    }
    if (url === '/api/tasks/t1/applications') {
      return json({ task: { id: 't1', title: 'Логотип для кав’ярні', status: taskStatus, priceKopecks: 50_000 }, applications });
    }
    if (url === '/api/tasks/t1/messages') return json({ messages: [] });
    return json({ status: 'ok' });
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const open = () => render(<RouterProvider router={createTestRouter(['/c/tasks/t1'])} future={providerFuture} />);
const assigns = () => fetchMock.mock.calls.filter(([url, init]) => url === '/api/tasks/t1/assign' && init?.method === 'POST');
const card = (name: string) => screen.findByRole('article', { name });

describe('Selecting an executor on /c/tasks/:id (US-25)', () => {
  it('US-25 sc.1 «Обрати виконавцем», the confirmation and the select: the student is chosen and the others are rejected', async () => {
    const user = userEvent.setup();
    open();

    await user.click(within(await card('Олена Коваль')).getByRole('button', { name: 'Обрати виконавцем' }));
    const confirmation = screen.getByRole('group', { name: 'Підтвердження вибору: Олена Коваль' });
    expect(confirmation).toHaveTextContent('зарезервувати 500 грн');
    await user.click(within(confirmation).getByRole('button', { name: 'Підтвердити вибір' }));

    const chosen = await card('Олена Коваль');
    expect(await within(chosen).findByText('Обрано виконавцем')).toBeInTheDocument();
    expect(within(chosen).getByText('Прийнято')).toBeInTheDocument();
    expect(within(screen.getByRole('article', { name: 'Петро Іваненко' })).getByText('Відхилено')).toBeInTheDocument();
    expect(JSON.parse(String(assigns()[0]?.[1]?.body))).toEqual({ applicationId: 'a1' });
    expect((assigns()[0]?.[1]?.headers as Record<string, string>)['Idempotency-Key']).toBeTruthy();
    expect(await screen.findByRole('heading', { name: 'Чат із виконавцем' })).toBeInTheDocument();
  });

  it('US-25 sc.1 cancelling the confirmation sends nothing', async () => {
    const user = userEvent.setup();
    open();

    await user.click(within(await card('Олена Коваль')).getByRole('button', { name: 'Обрати виконавцем' }));
    await user.click(screen.getByRole('button', { name: 'Скасувати' }));

    expect(assigns()).toHaveLength(0);
    expect(within(screen.getByRole('article', { name: 'Олена Коваль' })).getByRole('button', { name: 'Обрати виконавцем' })).toBeEnabled();
  });

  it('US-25 sc.2 once an executor is chosen the select buttons of the other candidates are off', async () => {
    const user = userEvent.setup();
    open();
    await user.click(within(await card('Олена Коваль')).getByRole('button', { name: 'Обрати виконавцем' }));
    await user.click(screen.getByRole('button', { name: 'Підтвердити вибір' }));
    await within(await card('Олена Коваль')).findByText('Обрано виконавцем');

    const other = screen.getByRole('article', { name: 'Петро Іваненко' });
    expect(within(other).getByRole('button', { name: 'Обрати виконавцем' })).toBeDisabled();
  });

  it('US-25 sc.2 a task that already has an executor opens with the buttons off', async () => {
    taskStatus = 'in_progress';
    applications = [candidate('a1', who('u1', 'Олена Коваль'), 'accepted'), candidate('a2', who('u2', 'Петро Іваненко'), 'rejected')];
    open();

    const other = await card('Петро Іваненко');
    expect(within(other).getByRole('button', { name: 'Обрати виконавцем' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Підтвердити вибір' })).not.toBeInTheDocument();
  });

  it('US-25 sc.2 the API code TASK_ALREADY_ASSIGNED (another tab won) is shown by its Ukrainian text', async () => {
    assignResponse = () => apiError('TASK_ALREADY_ASSIGNED', 409);
    const user = userEvent.setup();
    open();

    await user.click(within(await card('Олена Коваль')).getByRole('button', { name: 'Обрати виконавцем' }));
    await user.click(screen.getByRole('button', { name: 'Підтвердити вибір' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Виконавця вже обрано');
  });

  it('US-25 sc.3 not enough funds shows «Недостатньо коштів» and a link to the balance page', async () => {
    assignResponse = () => apiError('INSUFFICIENT_FUNDS', 422);
    const user = userEvent.setup();
    open();

    await user.click(within(await card('Олена Коваль')).getByRole('button', { name: 'Обрати виконавцем' }));
    await user.click(screen.getByRole('button', { name: 'Підтвердити вибір' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Недостатньо коштів');
    expect(within(alert).getByRole('link', { name: 'Поповнити баланс' })).toHaveAttribute('href', '/c/balance');
    expect(within(screen.getByRole('article', { name: 'Олена Коваль' })).getByRole('button', { name: 'Обрати виконавцем' })).toBeEnabled();
  });
});
