import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestRouter, providerFuture } from '../src/app/router';

/** US-40: the moderator's queue `/mod/tasks`. Only `fetch` is mocked. */

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const apiError = (code: string, status: number) => json({ error: { code, message: 'x' } }, status);

interface Item {
  id: string;
  title: string;
  description: string;
  priceKopecks: number;
  deadlineAt: string;
  customer: { id: string; displayName: string };
  status: 'pending_moderation' | 'published' | 'rejected';
  moderationReason: string | null;
  createdAt: string;
}

let items: Item[];
let calls: { url: string; body: unknown }[];
let decisionResponse: (() => Response) | null;

const item = (overrides: Partial<Item> = {}): Item => ({
  id: 't1',
  title: 'Логотип для кав’ярні',
  description: 'Потрібен простий логотип.',
  priceKopecks: 100_000,
  deadlineAt: new Date(Date.now() + 7 * 24 * 3600_000).toISOString(),
  customer: { id: 'c1', displayName: 'Кав’ярня «Зерно»' },
  status: 'pending_moderation',
  moderationReason: null,
  createdAt: '2026-11-19T10:00:00Z',
  ...overrides,
});

beforeEach(() => {
  items = [item()];
  calls = [];
  decisionResponse = null;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith('/api/mod/tasks?status=')) return json({ items: items.filter((i) => i.status === url.split('=')[1]) });
      const decision = url.match(/^\/api\/mod\/tasks\/(.+)\/(publish|reject)$/);
      if (decision && init?.method === 'POST') {
        calls.push({ url, body: init.body ? JSON.parse(String(init.body)) : {} });
        if (decisionResponse) return decisionResponse();
        const target = items.find((i) => i.id === decision[1])!;
        target.status = decision[2] === 'publish' ? 'published' : 'rejected';
        return json({ task: target });
      }
      return json({ status: 'ok' });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const open = () => render(<RouterProvider router={createTestRouter(['/mod/tasks'])} future={providerFuture} />);

describe('/mod/tasks: the moderator decides on a new task (US-40)', () => {
  it('US-40 the queue shows title, description, price, deadline, customer and «На модерації»', async () => {
    open();
    const row = await screen.findByRole('article', { name: 'Логотип для кав’ярні' });
    expect(within(row).getByText('Потрібен простий логотип.')).toBeInTheDocument();
    expect(within(row).getByText(/1\s?000 грн/)).toBeInTheDocument();
    expect(within(row).getByText(/Кав’ярня «Зерно»/)).toBeInTheDocument();
    expect(within(row).getByText(/На модерації/)).toBeInTheDocument();
    expect(within(row).queryByText(/дедлайн минув/)).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Модерація завдань' })).toBeInTheDocument();
  });

  it('US-40 OQ-43 d a past deadline is marked in the row', async () => {
    items = [item({ deadlineAt: new Date(Date.now() - 24 * 3600_000).toISOString() })];
    open();
    const row = await screen.findByRole('article', { name: 'Логотип для кав’ярні' });
    expect(within(row).getByText(/дедлайн минув/)).toBeInTheDocument();
  });

  it('US-40 sc.1 «Опублікувати» sends the decision and the row leaves the queue', async () => {
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole('button', { name: 'Опублікувати' }));

    expect(await screen.findByText('Завдання опубліковано.')).toHaveAttribute('role', 'status');
    expect(calls).toEqual([{ url: '/api/mod/tasks/t1/publish', body: {} }]);
    expect(await screen.findByText('Завдань на перевірку немає.')).toBeInTheDocument();
    expect(screen.queryByRole('article', { name: 'Логотип для кав’ярні' })).not.toBeInTheDocument();
  });

  it('US-40 sc.2 «Відхилити» without a reason shows REASON_REQUIRED and sends nothing; with a reason it is sent', async () => {
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole('button', { name: 'Відхилити' }));
    await user.click(screen.getByRole('button', { name: 'Підтвердити відхилення' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Вкажіть причину відхилення');
    expect(calls).toHaveLength(0);

    await user.type(screen.getByLabelText('Причина для замовника'), 'домашнє завдання');
    await user.click(screen.getByRole('button', { name: 'Підтвердити відхилення' }));

    expect(await screen.findByText('Завдання відхилено, замовник отримає причину.')).toBeInTheDocument();
    expect(calls).toEqual([{ url: '/api/mod/tasks/t1/reject', body: { reason: 'домашнє завдання' } }]);
  });

  it('a decision someone else already made (or the owner cancelled the task) is shown by its code in an alert', async () => {
    const user = userEvent.setup();
    decisionResponse = () => apiError('ALREADY_DECIDED', 409);
    open();
    await user.click(await screen.findByRole('button', { name: 'Опублікувати' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Рішення вже ухвалено');
  });

  it('the buttons are disabled while the request runs', async () => {
    const user = userEvent.setup();
    let release!: () => void;
    decisionResponse = () => json({ task: items[0] });
    const original = globalThis.fetch;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === 'POST') await new Promise<void>((resolve) => (release = resolve));
        return (original as typeof fetch)(url, init);
      }),
    );
    open();
    await user.click(await screen.findByRole('button', { name: 'Опублікувати' }));

    expect(screen.getByRole('button', { name: 'Опублікувати' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Відхилити' })).toBeDisabled();
    release();
  });
});
