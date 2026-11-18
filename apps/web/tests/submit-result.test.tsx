import { render, screen, waitFor } from '@testing-library/react';
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
const savedFile = { id: 'f1', name: 'logo.pdf', mime: 'application/pdf', sizeBytes: 2048, createdAt: '2026-11-12T10:00:00.000Z' };
const result = (status: string, files: unknown[]) => ({
  result: { version: 1, status, revisionComment: null, submittedAt: status === 'submitted' ? '2026-11-13T10:00:00.000Z' : null, files },
});

let taskStatus: string;
let current: { result: unknown };
let submitAnswer: () => Response | Promise<Response>;
let submits: number;

beforeEach(() => {
  taskStatus = 'in_progress';
  current = result('draft', [savedFile]);
  submits = 0;
  submitAnswer = () => {
    taskStatus = 'in_review';
    current = result('submitted', [savedFile]);
    return json({ task: { id: 't1', status: 'in_review' }, ...current });
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/tasks/t1') return json({ task: { ...work, status: taskStatus } });
      if (url === '/api/tasks/t1/messages') return json({ messages: [] });
      if (url === '/api/tasks/t1/result/submit' && init?.method === 'POST') {
        submits += 1;
        return submitAnswer();
      }
      if (url === '/api/tasks/t1/result/files' && init?.method === 'POST') {
        current = result('draft', [savedFile]);
        return json(current, 201);
      }
      if (url === '/api/tasks/t1/result') return json(current);
      return json({ status: 'ok' });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const openCard = () => render(<RouterProvider router={createTestRouter(['/work/t1'])} future={providerFuture} />);
const sendButton = () => screen.findByRole('button', { name: 'Надіслати на перевірку' });

describe('/work/:taskId «Надіслати на перевірку» (US-28)', () => {
  it('US-28 sc.1 with a saved file the button is on; pressing it sends the result and the card shows «На перевірці»', async () => {
    openCard();
    const button = await sendButton();
    await waitFor(() => expect(button).toBeEnabled());

    await userEvent.click(button);

    // The footer has its own role="status" (API health), so the message is found by its text and its role is checked.
    const done = await screen.findByText('Результат надіслано на перевірку. Замовник отримав сповіщення.');
    expect(done).toHaveAttribute('role', 'status');
    expect(submits).toBe(1);
    expect(await screen.findByText('На перевірці')).toBeInTheDocument();
    // The upload form and the button go away: the files are locked in review.
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Надіслати на перевірку' })).not.toBeInTheDocument());
    expect(screen.queryByRole('form', { name: 'Завантаження результату' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'logo.pdf' })).toBeInTheDocument();
  });

  it('US-28 sc.2 with no file the button is disabled and says why; nothing is sent', async () => {
    current = { result: null };
    openCard();

    const button = await sendButton();
    expect(button).toBeDisabled();
    // The hint comes once the result is loaded, so it does not flash while it is still being fetched.
    expect(await screen.findByText('Щоб надіслати результат, спочатку збережіть хоча б один файл.')).toBeInTheDocument();
    expect(button).toHaveAccessibleDescription('Щоб надіслати результат, спочатку збережіть хоча б один файл.');
    await userEvent.click(button);
    expect(submits).toBe(0);
  });

  it('US-28 sc.2 after a file is saved the button turns on', async () => {
    current = { result: null };
    openCard();
    const button = await sendButton();
    expect(button).toBeDisabled();

    await userEvent.upload(await screen.findByLabelText('Файл результату (до 50 МБ)'), new File(['%PDF-1.4'], 'logo.pdf', { type: 'application/pdf' }), { applyAccept: false });
    await userEvent.click(screen.getByRole('button', { name: 'Зберегти результат' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Надіслати на перевірку' })).toBeEnabled());
  });

  it('US-28 sc.2 if the server still refuses with NO_RESULT_FILES its text is shown and the task stays in progress', async () => {
    submitAnswer = () => apiError('NO_RESULT_FILES', 409);
    openCard();
    const button = await sendButton();
    await waitFor(() => expect(button).toBeEnabled());

    await userEvent.click(button);

    expect(await screen.findByRole('alert')).toHaveTextContent('Додайте файл результату');
    expect(screen.getByText('В роботі')).toBeInTheDocument();
    expect(screen.queryByText('Результат надіслано на перевірку. Замовник отримав сповіщення.')).not.toBeInTheDocument();
  });

  it('US-28 sc.3 when the task is already in review the answer is 409 ALREADY_IN_REVIEW: its text is shown and the card shows the real status', async () => {
    submitAnswer = () => {
      taskStatus = 'in_review'; // another tab sent it first
      return apiError('ALREADY_IN_REVIEW', 409);
    };
    openCard();
    const button = await sendButton();
    await waitFor(() => expect(button).toBeEnabled());

    await userEvent.click(button);

    expect(await screen.findByRole('alert')).toHaveTextContent('Результат уже на перевірці');
    expect(await screen.findByText('На перевірці')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Надіслати на перевірку' })).not.toBeInTheDocument());
  });

  it('US-28 sc.3 a double click sends one request: the button is off while the request runs', async () => {
    let release: (response: Response) => void = () => undefined;
    submitAnswer = () =>
      new Promise<Response>((resolve) => {
        release = resolve;
      });
    openCard();
    const button = await sendButton();
    await waitFor(() => expect(button).toBeEnabled());

    await userEvent.click(button);
    await waitFor(() => expect(button).toBeDisabled());
    await userEvent.click(button);
    expect(submits).toBe(1);

    taskStatus = 'in_review';
    current = result('submitted', [savedFile]);
    release(json({ task: { id: 't1', status: 'in_review' }, ...current }));
    expect(await screen.findByText('На перевірці')).toBeInTheDocument();
    expect(submits).toBe(1);
  });

  it('a task already in review shows no button to send it again (the lock message belongs to US-29)', async () => {
    taskStatus = 'in_review';
    current = result('submitted', [savedFile]);
    openCard();

    expect(await screen.findByText('На перевірці')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'logo.pdf' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Надіслати на перевірку' })).not.toBeInTheDocument();
  });
});
