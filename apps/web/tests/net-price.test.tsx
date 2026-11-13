import { render, screen, within } from '@testing-library/react';
import { RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestRouter, providerFuture } from '../src/app/router';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

// 1000 UAH at 10%: the student receives 900 UAH (the snapshot of publication, as the API sends it).
const task = (overrides: Record<string, unknown> = {}) => ({
  id: 't1',
  title: 'Парсер сайту',
  description: 'Потрібен скрипт.',
  priceKopecks: 100_000,
  commissionKopecks: 10_000,
  netKopecks: 90_000,
  deadlineAt: '2030-05-20T15:30:00.000Z',
  publishedAt: '2026-11-10T10:00:00.000Z',
  ...overrides,
});

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/tasks/t1') return json({ task: task() });
      if (url === '/api/tasks/no-net') return json({ task: task({ commissionKopecks: null, netKopecks: null }) });
      if (url === '/api/tasks') return json({ tasks: [task(), task({ id: 't2', title: 'Без знімка', commissionKopecks: null, netKopecks: null })], nextCursor: null });
      return json({ status: 'ok' });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const open = (path: string) => render(<RouterProvider router={createTestRouter([path])} future={providerFuture} />);

/** The text of the value that belongs to a label, so the test fails if the two ever run together. */
const valueOf = (scope: Pick<typeof screen, 'getByText'>, label: string | RegExp) =>
  scope.getByText(label).closest('div')!.querySelector('dd')!;

describe('/feed cards (US-15)', () => {
  it('US-15 sc.1 the card shows the customer price 1 000 грн and, separately, the net amount 900 грн', async () => {
    open('/feed');

    const list = await screen.findByRole('list', { name: 'Доступні завдання' });
    const card = within(list).getAllByRole('article')[0]!;

    expect(valueOf(within(card), 'Ціна замовника')).toHaveTextContent('1 000 грн');
    expect(valueOf(within(card), /Ви отримаєте/)).toHaveTextContent('900 грн');
  });

  it('US-15 sc.3 the amounts are separate labelled values, so the net cannot merge into the gross', async () => {
    open('/feed');

    const list = await screen.findByRole('list', { name: 'Доступні завдання' });
    const card = within(list).getAllByRole('article')[0]!;
    const gross = valueOf(within(card), 'Ціна замовника');
    const net = valueOf(within(card), /Ви отримаєте/);

    expect(gross).not.toBe(net);
    expect(gross.closest('div')).not.toBe(net.closest('div')); // each in its own row, which stacks on a narrow screen
    expect(gross).not.toHaveTextContent('900');
    expect(net).not.toHaveTextContent('1 000');
    // both have a term and a definition, so a screen reader announces the label with each amount
    expect(within(card).getAllByRole('term')).toHaveLength(2);
    expect(within(card).getAllByRole('definition')).toHaveLength(2);
  });

  it('US-15 sc.1 a task without a snapshot shows the price and no net line', async () => {
    open('/feed');

    const list = await screen.findByRole('list', { name: 'Доступні завдання' });
    const card = within(list).getAllByRole('article')[1]!;

    expect(valueOf(within(card), 'Ціна замовника')).toHaveTextContent('1 000 грн');
    expect(within(card).queryByText(/Ви отримаєте/)).toBeNull();
    expect(card.textContent).not.toMatch(/NaN|null/);
  });
});

describe('/tasks/:id page (US-15)', () => {
  it('US-15 sc.1 the details show the fixed price 1 000 грн and the net amount 900 грн', async () => {
    open('/tasks/t1');

    expect(await screen.findByRole('heading', { level: 2, name: 'Парсер сайту' })).toBeInTheDocument();
    expect(valueOf(screen, 'Фіксована ціна')).toHaveTextContent('1 000 грн');
    expect(valueOf(screen, /Ви отримаєте/)).toHaveTextContent('900 грн');
  });

  it('US-15 sc.3 on the details page the net is a separate labelled value too', async () => {
    open('/tasks/t1');

    await screen.findByRole('heading', { level: 2, name: 'Парсер сайту' });
    const gross = valueOf(screen, 'Фіксована ціна');
    const net = valueOf(screen, /Ви отримаєте/);

    expect(gross.closest('div')).not.toBe(net.closest('div'));
    expect(gross).not.toHaveTextContent('900');
    expect(net).not.toHaveTextContent('1 000');
  });

  it('US-15 sc.1 details without a snapshot show the price and no net line', async () => {
    open('/tasks/no-net');

    await screen.findByRole('heading', { level: 2, name: 'Парсер сайту' });
    expect(valueOf(screen, 'Фіксована ціна')).toHaveTextContent('1 000 грн');
    expect(screen.queryByText(/Ви отримаєте/)).toBeNull();
  });
});
