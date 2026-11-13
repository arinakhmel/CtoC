import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestRouter, providerFuture } from '../src/app/router';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const apiError = (code: string, status: number) => json({ error: { code, message: 'x' } }, status);

const task = (n: number, overrides: Record<string, unknown> = {}) => ({
  id: `t${n}`,
  title: `Завдання ${n}`,
  description: `Опис завдання ${n}`,
  priceKopecks: 50_000,
  deadlineAt: '2030-05-20T15:30:00.000Z',
  publishedAt: '2026-11-10T10:00:00.000Z',
  ...overrides,
});

let feedResponse: (url: string) => Response;
let requested: string[];

beforeEach(() => {
  requested = [];
  feedResponse = () => json({ tasks: [], nextCursor: null });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.startsWith('/api/tasks')) {
        requested.push(url);
        return feedResponse(url);
      }
      return json({ status: 'ok' });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const open = () => render(<RouterProvider router={createTestRouter(['/feed'])} future={providerFuture} />);
const flat = (text: string) => text.replace(/\s+/g, ' ');

describe('/feed page (US-12)', () => {
  it('US-12 sc.1 each card shows the description, the fixed price and the deadline', async () => {
    feedResponse = () => json({ tasks: [task(1, { priceKopecks: 50_000 }), task(2, { priceKopecks: 123_450 })], nextCursor: null });

    open();

    const list = await screen.findByRole('list', { name: 'Доступні завдання' });
    const cards = within(list).getAllByRole('article');
    expect(cards).toHaveLength(2);
    expect(within(cards[0]!).getByRole('heading', { name: 'Завдання 1' })).toBeInTheDocument();
    expect(within(cards[0]!).getByText('Опис завдання 1')).toBeInTheDocument();
    expect(flat(cards[0]!.textContent ?? '')).toContain('500 грн');
    expect(flat(cards[1]!.textContent ?? '')).toContain('1 234,50 грн');
    const time = within(cards[0]!).getByText(/2030/);
    expect(time.tagName).toBe('TIME');
    expect(time).toHaveAttribute('datetime', '2030-05-20T15:30:00.000Z');
    expect(screen.queryByRole('button', { name: 'Показати ще' })).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull(); // no field for an own price (US-13)
  });

  it('US-12 sc.1 «Показати ще» loads the next page by cursor and appends it', async () => {
    feedResponse = (url) =>
      url.includes('cursor=t1') ? json({ tasks: [task(2)], nextCursor: null }) : json({ tasks: [task(1)], nextCursor: 't1' });
    const user = userEvent.setup();
    open();

    await user.click(await screen.findByRole('button', { name: 'Показати ще' }));

    expect(await screen.findByRole('heading', { name: 'Завдання 2' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Завдання 1' })).toBeInTheDocument();
    expect(requested).toEqual(['/api/tasks', '/api/tasks?cursor=t1']);
    expect(screen.queryByRole('button', { name: 'Показати ще' })).toBeNull();
  });

  it('US-12 sc.1 an empty feed says so', async () => {
    open();
    expect(await screen.findByText('Поки що немає доступних завдань.')).toBeInTheDocument();
  });

  it('US-12 sc.3 a missing session (401 AUTH_REQUIRED) sends the user to the login page', async () => {
    feedResponse = () => apiError('AUTH_REQUIRED', 401);

    open();

    expect(await screen.findByRole('form', { name: 'Вхід' })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Доступні завдання' })).toBeNull();
  });

  it('US-12 sc.3 an unconfirmed email (403 EMAIL_NOT_CONFIRMED) shows the message and a link to confirm', async () => {
    feedResponse = () => apiError('EMAIL_NOT_CONFIRMED', 403);

    open();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Спершу підтвердіть пошту');
    expect(within(alert).getByRole('link', { name: 'Підтвердити пошту' })).toHaveAttribute('href', '/confirm-email');
  });

  it('US-12 sc.3 a customer (403 ROLE_FORBIDDEN) sees the access message and no tasks', async () => {
    feedResponse = () => apiError('ROLE_FORBIDDEN', 403);

    open();

    expect(await screen.findByRole('alert')).toHaveTextContent('Доступ заборонено');
    expect(screen.queryByRole('list', { name: 'Доступні завдання' })).toBeNull();
    expect(screen.queryByText('Поки що немає доступних завдань.')).toBeNull();
  });
});
