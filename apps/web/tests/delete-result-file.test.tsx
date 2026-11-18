import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestRouter, providerFuture } from '../src/app/router';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const apiError = (code: string, status: number) => json({ error: { code, message: 'x' } }, status);

const work = {
  id: 't1',
  title: 'Логотип для кав’ярні',
  description: 'Потрібен логотип у двох кольорах.',
  priceKopecks: 50_000,
  commissionKopecks: 5_000,
  netKopecks: 45_000,
  deadlineAt: '2030-05-20T15:30:00.000Z',
  publishedAt: '2026-11-10T10:00:00.000Z',
  status: 'in_progress',
  assignedAt: '2026-11-11T10:00:00.000Z',
};
const file = (id: string, name: string) => ({ id, name, mime: 'application/pdf', sizeBytes: 2048, createdAt: '2026-11-12T10:00:00.000Z' });
const A = file('f1', 'a.pdf');
const B = file('f2', 'b.pdf');
const result = (status: string, files: unknown[]) => ({
  result: { version: 1, status, revisionComment: null, submittedAt: status === 'submitted' ? '2026-11-13T10:00:00.000Z' : null, files },
});

let taskStatus: string;
let current: { result: unknown };
let deleteAnswer: (fileId: string) => Response | Promise<Response>;
let deletes: string[];
let workFetches: number;

beforeEach(() => {
  taskStatus = 'in_progress';
  current = result('draft', [A, B]);
  deletes = [];
  workFetches = 0;
  deleteAnswer = () => new Response(null, { status: 204 });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/me/work') {
        workFetches += 1;
        return json({ tasks: [{ ...work, status: taskStatus }] });
      }
      if (url === '/api/tasks/t1') return json({ task: { ...work, status: taskStatus } });
      if (url === '/api/tasks/t1/messages') return json({ messages: [] });
      if (url.startsWith('/api/tasks/t1/result/files/') && init?.method === 'DELETE') {
        const id = url.split('/').pop()!;
        deletes.push(id);
        return deleteAnswer(id);
      }
      if (url === '/api/tasks/t1/result') return json(current);
      return json({ status: 'ok' });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const openCard = () => render(<RouterProvider router={createTestRouter(['/work/t1'])} future={providerFuture} />);
const openList = () => render(<RouterProvider router={createTestRouter(['/me/work'])} future={providerFuture} />);
const deleteButton = (name: string) => screen.findByRole('button', { name: `Видалити файл ${name}` });
const LOCK_NOTE = 'Результат на перевірці, редагування заблоковано до рішення замовника.';

describe('/me/work shows «На перевірці» (US-29 sc.1, sc.2)', () => {
  it('US-29 sc.1 the student list shows «На перевірці» next to the task that was sent for review', async () => {
    taskStatus = 'in_review';
    openList();

    const item = await screen.findByRole('article', { name: 'Логотип для кав’ярні' });
    expect(within(item).getByText('На перевірці')).toBeInTheDocument();
    expect(within(item).getByRole('link', { name: 'Логотип для кав’ярні' })).toHaveAttribute('href', '/work/t1');
  });

  it('US-29 sc.2 after the app is closed and opened again the status is read from the server and is still «На перевірці»', async () => {
    taskStatus = 'in_review';
    const first = openList();
    expect(await within(await screen.findByRole('article', { name: 'Логотип для кав’ярні' })).findByText('На перевірці')).toBeInTheDocument();
    first.unmount(); // closes the app: nothing is kept in the browser

    openList(); // a new start of the app, with a new cache

    const item = await screen.findByRole('article', { name: 'Логотип для кав’ярні' });
    expect(within(item).getByText('На перевірці')).toBeInTheDocument();
    expect(workFetches).toBe(2); // it was asked from the server again, not remembered
  });
});

describe('Editing is blocked in review (US-29 sc.3)', () => {
  it('US-29 sc.3 in review the card says it is locked and has no «Видалити», no upload form and no send button; the files stay as links', async () => {
    taskStatus = 'in_review';
    current = result('submitted', [A, B]);
    openCard();

    expect(await screen.findByText(LOCK_NOTE)).toHaveAttribute('role', 'status');
    expect(await screen.findByRole('link', { name: 'a.pdf' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'b.pdf' })).toBeInTheDocument();
    expect(screen.queryAllByRole('button', { name: /Видалити/ })).toHaveLength(0);
    expect(screen.queryByRole('form', { name: 'Завантаження результату' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Надіслати на перевірку' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Зберегти результат' })).not.toBeInTheDocument();
  });

  it('US-29 sc.3 the note is not shown while the task is in progress', async () => {
    openCard();

    expect(await deleteButton('a.pdf')).toBeInTheDocument();
    expect(screen.queryByText(LOCK_NOTE)).not.toBeInTheDocument();
  });

  it('US-29 sc.3 if the server says RESULT_LOCKED (sent for review in another tab) its text is shown and the card switches to the locked view', async () => {
    deleteAnswer = () => {
      taskStatus = 'in_review';
      current = result('submitted', [A, B]);
      return apiError('RESULT_LOCKED', 409);
    };
    openCard();

    await userEvent.click(await deleteButton('a.pdf'));

    expect(await screen.findByRole('alert')).toHaveTextContent('Результат на перевірці, редагування заблоковано');
    expect(await screen.findByText(LOCK_NOTE)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryAllByRole('button', { name: /Видалити/ })).toHaveLength(0));
    expect(screen.getByRole('link', { name: 'a.pdf' })).toBeInTheDocument(); // the file was not deleted
  });

  it('INV-16 the files of a returned version have no «Видалити», but the upload form is there for the new version', async () => {
    taskStatus = 'revision';
    current = result('returned', [A]);
    openCard();

    expect(await screen.findByRole('link', { name: 'a.pdf' })).toBeInTheDocument();
    expect(await screen.findByRole('form', { name: 'Завантаження результату' })).toBeInTheDocument();
    expect(screen.queryAllByRole('button', { name: /Видалити/ })).toHaveLength(0);
    expect(screen.queryByText(LOCK_NOTE)).not.toBeInTheDocument();
  });
});

describe('Deleting a file of the draft (US-29)', () => {
  it('US-29 «Видалити» next to a file sends the delete and the file leaves the list, the other stays', async () => {
    openCard();

    await userEvent.click(await deleteButton('a.pdf'));

    await waitFor(() => expect(screen.queryByRole('link', { name: 'a.pdf' })).not.toBeInTheDocument());
    expect(deletes).toEqual(['f1']);
    expect(screen.getByRole('link', { name: 'b.pdf' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('US-29 after the last file is deleted the card says there are no files and the send button is off again', async () => {
    current = result('draft', [A]);
    openCard();

    await userEvent.click(await deleteButton('a.pdf'));

    expect(await screen.findByText('Файлів результату ще немає.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Надіслати на перевірку' })).toBeDisabled();
  });

  it('US-29 a file that is already gone (404, a second click or another tab) needs no error: the list is fetched again', async () => {
    deleteAnswer = () => {
      current = result('draft', [B]); // the other tab deleted it first
      return apiError('NOT_FOUND', 404);
    };
    openCard();

    await userEvent.click(await deleteButton('a.pdf'));

    await waitFor(() => expect(screen.queryByRole('link', { name: 'a.pdf' })).not.toBeInTheDocument());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'b.pdf' })).toBeInTheDocument();
  });

  it('US-29 a double click sends one delete: the buttons are off while it runs', async () => {
    let release: (response: Response) => void = () => undefined;
    deleteAnswer = () =>
      new Promise<Response>((resolve) => {
        release = resolve;
      });
    openCard();
    const button = await deleteButton('a.pdf');

    await userEvent.click(button);
    await waitFor(() => expect(button).toBeDisabled());
    expect(screen.getByRole('button', { name: 'Видалити файл b.pdf' })).toBeDisabled();
    await userEvent.click(button);
    expect(deletes).toEqual(['f1']);

    release(new Response(null, { status: 204 }));
    await waitFor(() => expect(screen.queryByRole('link', { name: 'a.pdf' })).not.toBeInTheDocument());
    expect(deletes).toEqual(['f1']);
  });

  it('US-29 another failure (the connection) shows a message and the file stays', async () => {
    deleteAnswer = () => {
      throw new TypeError('network down');
    };
    openCard();

    await userEvent.click(await deleteButton('a.pdf'));

    expect(await screen.findByRole('alert')).toHaveTextContent('Немає зв’язку із сервером');
    expect(screen.getByRole('link', { name: 'a.pdf' })).toBeInTheDocument();
  });
});
