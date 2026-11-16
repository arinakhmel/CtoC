import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestRouter, providerFuture } from '../src/app/router';
import { CHAT_POLL_MS } from '../src/features/chat/queries/chat';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const apiError = (code: string, status: number) => json({ error: { code, message: 'x' } }, status);

const work = {
  id: 't1',
  title: 'Логотип для кав’ярні',
  description: 'Потрібен логотип.',
  priceKopecks: 50_000,
  commissionKopecks: null,
  netKopecks: null,
  deadlineAt: '2030-05-20T15:30:00.000Z',
  publishedAt: '2026-11-10T10:00:00.000Z',
  status: 'in_progress',
  assignedAt: '2026-11-11T10:00:00.000Z',
};
const msg = (id: string, body: string, mine: boolean, from: 'customer' | 'executor') => ({
  id,
  body,
  mine,
  from,
  createdAt: '2026-11-12T09:15:00.000Z',
});

let messages: ReturnType<typeof msg>[];
let postResponse: ((init: RequestInit) => Response) | null;
let listResponse: (() => Response) | null;
let taskStatus: string;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  messages = [];
  postResponse = null;
  listResponse = null;
  taskStatus = 'in_progress';
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/tasks/t1') return json({ task: { ...work, status: taskStatus } });
    if (url === '/api/tasks/t1/messages' && init?.method === 'POST') {
      if (postResponse) return postResponse(init);
      const { body } = JSON.parse(String(init.body)) as { body: string };
      const created = msg(`m${messages.length + 1}`, body, true, 'executor');
      messages = [...messages, created];
      return json({ message: created }, 201);
    }
    if (url === '/api/tasks/t1/messages') return listResponse ? listResponse() : json({ messages });
    return json({ status: 'ok' });
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const open = () => render(<RouterProvider router={createTestRouter(['/work/t1'])} future={providerFuture} />);
const posts = () => fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST');
const taskCalls = () => fetchMock.mock.calls.filter(([url]) => url === '/api/tasks/t1');
const listCalls = () => fetchMock.mock.calls.filter(([url, init]) => url === '/api/tasks/t1/messages' && init?.method !== 'POST');

describe('Chat on /work/:taskId (US-23)', () => {
  it('US-23 sc.1 the student types a message, presses «Надіслати», and it appears in the chat', async () => {
    const user = userEvent.setup();
    open();

    await user.type(await screen.findByLabelText('Повідомлення'), 'Добрий день!');
    await user.click(screen.getByRole('button', { name: 'Надіслати' }));

    const log = await screen.findByRole('log', { name: 'Повідомлення чату' });
    expect(await within(log).findByText('Добрий день!', { exact: false })).toBeInTheDocument();
    expect(within(log).getByText('Ви:')).toBeInTheDocument();
    expect(JSON.parse(String(posts()[0]?.[1]?.body))).toEqual({ body: 'Добрий день!' });
    expect(screen.getByLabelText('Повідомлення')).toHaveValue('');
  });

  it("US-23 the executor's chat has the default heading «Чат із замовником» (the customer's page passes its own)", async () => {
    open();
    expect(await screen.findByRole('heading', { name: 'Чат із замовником' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Чат із виконавцем' })).not.toBeInTheDocument();
  });

  it('US-23 sc.1 a message of the customer shows up on the next poll, without a reload', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    open();
    expect(await screen.findByText('Повідомлень поки немає.')).toBeInTheDocument();

    messages = [msg('m1', 'Надішліть у форматі SVG', false, 'customer')];
    await vi.advanceTimersByTimeAsync(CHAT_POLL_MS + 100);

    const log = await screen.findByRole('log', { name: 'Повідомлення чату' });
    expect(await within(log).findByText('Надішліть у форматі SVG', { exact: false })).toBeInTheDocument();
    expect(within(log).getByText('Замовник:')).toBeInTheDocument();
  });

  it('US-23 sc.2 the send button is off while the field is empty or only spaces, and nothing is sent', async () => {
    const user = userEvent.setup();
    open();

    const button = await screen.findByRole('button', { name: 'Надіслати' });
    expect(button).toBeDisabled();
    await user.type(screen.getByLabelText('Повідомлення'), '   ');
    expect(button).toBeDisabled();
    await user.type(screen.getByLabelText('Повідомлення'), 'Привіт');
    expect(button).toBeEnabled();
    expect(posts()).toHaveLength(0);
  });

  it('US-23 sc.2 a message over 2000 characters is blocked with the length message and nothing is sent', async () => {
    const user = userEvent.setup();
    open();

    await user.click(await screen.findByLabelText('Повідомлення'));
    await user.paste('а'.repeat(2001));
    await user.click(screen.getByRole('button', { name: 'Надіслати' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Повідомлення занадто довге');
    expect(posts()).toHaveLength(0);
    // the error is tied to the field for screen readers
    const field = screen.getByLabelText('Повідомлення');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveAttribute('aria-describedby', 'chat-body-error');
    expect(document.getElementById('chat-body-error')).toHaveTextContent('Повідомлення занадто довге');
  });

  it('US-23 the API code CHAT_CLOSED is shown by its Ukrainian text', async () => {
    postResponse = () => apiError('CHAT_CLOSED', 409);
    const user = userEvent.setup();
    open();

    await user.type(await screen.findByLabelText('Повідомлення'), 'Привіт');
    await user.click(screen.getByRole('button', { name: 'Надіслати' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Чат закрито');
  });

  it('US-23 INV-22 when sending fails with CHAT_CLOSED the task is fetched again and the panel turns read-only without a reload', async () => {
    postResponse = () => apiError('CHAT_CLOSED', 409);
    const user = userEvent.setup();
    open();
    await user.type(await screen.findByLabelText('Повідомлення'), 'Привіт');
    const before = taskCalls().length;

    taskStatus = 'done'; // the task was accepted meanwhile, in another tab
    await user.click(screen.getByRole('button', { name: 'Надіслати' }));

    expect(await screen.findByText(/Чат закрито: завдання завершене/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Повідомлення')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Надіслати' })).not.toBeInTheDocument();
    expect(taskCalls().length).toBeGreaterThan(before);
  });

  it.each([
    ['done', 'завдання завершене'],
    ['cancelled', 'завдання скасоване'],
  ])('US-23 INV-22 a %s task shows the history and no form: the chat is read-only', async (status, note) => {
    taskStatus = status;
    messages = [msg('m1', 'Остання домовленість', false, 'customer')];
    open();

    const log = await screen.findByRole('log', { name: 'Повідомлення чату' });
    expect(await within(log).findByText('Остання домовленість', { exact: false })).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`Чат закрито: ${note}`))).toBeInTheDocument();
    expect(screen.queryByLabelText('Повідомлення')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Надіслати' })).not.toBeInTheDocument();
  });

  it.each([
    ['NOT_CHAT_PARTICIPANT', 403],
    ['NOT_FOUND', 404],
  ])('US-23 sc.3 after %s the chat shows the error and stops polling', async (code, status) => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    listResponse = () => apiError(code, status);
    open();

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    const callsAfterFirst = listCalls().length;
    await vi.advanceTimersByTimeAsync(CHAT_POLL_MS * 3 + 100);

    expect(listCalls()).toHaveLength(callsAfterFirst);
  });

  it('US-23 sc.1 a healthy chat keeps polling every 5 seconds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    open();
    expect(await screen.findByText('Повідомлень поки немає.')).toBeInTheDocument();
    const before = listCalls().length;

    await vi.advanceTimersByTimeAsync(CHAT_POLL_MS * 2 + 100);

    expect(listCalls().length).toBeGreaterThan(before);
  });
});
