import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestRouter, providerFuture } from '../src/app/router';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const apiError = (code: string, status: number) => json({ error: { code, message: 'x' } }, status);

const task = (n: number) => ({
  id: `t${n}`,
  title: `Завдання ${n}`,
  description: `Опис завдання ${n}`,
  priceKopecks: 50_000,
  deadlineAt: '2030-05-20T15:30:00.000Z',
  publishedAt: '2026-11-10T10:00:00.000Z',
});

let respond: (url: string) => Response;

beforeEach(() => {
  respond = () => json({ tasks: [], nextCursor: null });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => (url.startsWith('/api/tasks') ? respond(url) : json({ status: 'ok' }))),
  );
});
afterEach(() => vi.unstubAllGlobals());

const flat = (text: string) => text.replace(/\s+/g, ' ');

/** The student sees no way to offer a price: no text or number field, no bid button. */
function expectNoBidControls() {
  expect(screen.queryByRole('textbox')).toBeNull();
  expect(screen.queryByRole('spinbutton')).toBeNull();
  expect(screen.queryByRole('button', { name: /ставк/i })).toBeNull();
  expect(screen.queryByLabelText(/ціна|ставка|пропоную/i)).toBeNull();
}

describe('/tasks/:id page (US-13)', () => {
  it('US-13 sc.1 shows the fixed price of 500 грн and no field to offer another price', async () => {
    respond = (url) => (url === '/api/tasks/t1' ? json({ task: task(1) }) : apiError('NOT_FOUND', 404));

    render(<RouterProvider router={createTestRouter(['/tasks/t1'])} future={providerFuture} />);

    expect(await screen.findByRole('heading', { level: 2, name: 'Завдання 1' })).toBeInTheDocument();
    expect(screen.getByText('Фіксована ціна').nextElementSibling).toHaveTextContent('500 грн');
    expectNoBidControls();
  });

  it('US-13 sc.1 a task that is not available shows the not-found message', async () => {
    respond = () => apiError('NOT_FOUND', 404);

    render(<RouterProvider router={createTestRouter(['/tasks/gone'])} future={providerFuture} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Не знайдено');
    expectNoBidControls();
  });

  it('US-13 sc.1 a failed refetch shows the error and no stale details from the cache', async () => {
    const user = userEvent.setup();
    let detailsCalls = 0;
    respond = (url) => {
      if (url === '/api/tasks/t1') {
        detailsCalls += 1;
        return detailsCalls === 1 ? json({ task: task(1) }) : apiError('NOT_FOUND', 404); // the task was taken meanwhile
      }
      return json({ tasks: [task(1)], nextCursor: null });
    };

    render(<RouterProvider router={createTestRouter(['/tasks/t1'])} future={providerFuture} />);
    expect(await screen.findByRole('heading', { level: 2, name: 'Завдання 1' })).toBeInTheDocument();

    // Leave and come back: the page mounts with the cached task and refetches it.
    await user.click(screen.getByRole('link', { name: 'До стрічки завдань' }));
    await user.click(await screen.findByRole('link', { name: 'Завдання 1' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Не знайдено');
    expect(screen.queryByRole('heading', { level: 2, name: 'Завдання 1' })).toBeNull();
    expect(flat(document.body.textContent ?? '')).not.toContain('Фіксована ціна');
    expect(detailsCalls).toBe(2);
  });
});

describe('/feed cards (US-13)', () => {
  it('US-13 sc.3 the cards show the fixed price and have no «Зробити ставку» button or price field', async () => {
    respond = () => json({ tasks: [task(1), task(2)], nextCursor: null });

    render(<RouterProvider router={createTestRouter(['/feed'])} future={providerFuture} />);

    const list = await screen.findByRole('list', { name: 'Доступні завдання' });
    const cards = within(list).getAllByRole('article');
    expect(cards).toHaveLength(2);
    for (const card of cards) expect(flat(card.textContent ?? '')).toContain('500 грн');
    expect(screen.queryByText('Зробити ставку')).toBeNull();
    expectNoBidControls();
    // each card links to the details page
    expect(within(cards[0]!).getByRole('link', { name: 'Завдання 1' })).toHaveAttribute('href', '/tasks/t1');
  });
});
