import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestRouter, providerFuture } from '../src/app/router';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const apiError = (code: string, status: number) => json({ error: { code, message: 'x' } }, status);

const TEXT = 'Вас обрано виконавцем завдання Парсер сайту';
const note = (read: boolean) => ({
  id: 'n1',
  type: 'executor_selected',
  text: TEXT,
  payload: { taskId: 't1', taskTitle: 'Парсер сайту' },
  read,
  createdAt: '2026-11-12T09:15:00.000Z',
});

let state: { read: boolean };
let listResponse: (() => Response) | null;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  state = { read: false };
  listResponse = null;
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/me/notifications') return listResponse ? listResponse() : json({ notifications: [note(state.read)] });
    if (url === '/api/me/notifications/n1/read' && init?.method === 'POST') {
      state.read = true;
      return new Response(null, { status: 204 });
    }
    return json({ status: 'ok' });
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const open = () => render(<RouterProvider router={createTestRouter(['/notifications'])} future={providerFuture} />);

describe('/notifications centre (US-21)', () => {
  it('US-21 sc.1 the student sees «Вас обрано виконавцем завдання [Назва]» marked as new', async () => {
    open();

    const item = await screen.findByRole('article', { name: TEXT });
    expect(within(item).getByText('Нове:')).toBeInTheDocument();
    expect(within(item).getByText(TEXT, { exact: false })).toBeInTheDocument();
  });

  it('US-21 sc.3 an older unread notification is listed on opening the centre, and marking it read removes the new mark', async () => {
    const user = userEvent.setup();
    open();

    const item = await screen.findByRole('article', { name: TEXT });
    await user.click(within(item).getByRole('button', { name: 'Позначити прочитаним' }));

    await vi.waitFor(() => expect(screen.queryByText('Нове:')).not.toBeInTheDocument());
    expect(screen.getByRole('article', { name: TEXT })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Позначити прочитаним' })).not.toBeInTheDocument();
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(post?.[0]).toBe('/api/me/notifications/n1/read');
  });

  it('US-21 with no notifications the page says so', async () => {
    listResponse = () => json({ notifications: [] });
    open();
    expect(await screen.findByText('Сповіщень поки немає.')).toBeInTheDocument();
  });

  it('US-21 a failed load shows the error message', async () => {
    listResponse = () => apiError('INTERNAL_ERROR', 500);
    open();
    expect(await screen.findByRole('alert')).toHaveTextContent('Щось пішло не так');
  });
});
