import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestRouter, providerFuture } from '../src/app/router';

/** US-36, A-10 (OQ-10, OQ-42): the moderator's queue `/mod/withdrawals`. Only `fetch` is mocked. */

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const apiError = (code: string, status: number) => json({ error: { code, message: 'x' } }, status);

interface Item {
  id: string;
  student: { id: string; displayName: string };
  amountKopecks: number;
  cardNumber: string | null;
  cardLast4: string;
  status: 'requested' | 'paid' | 'rejected';
  createdAt: string;
  processedAt: string | null;
  reason: string | null;
}

let items: Item[];
let calls: { url: string; body: unknown }[];
let decisionResponse: (() => Response) | null;
let queueResponse: (() => Response) | null;

const item = (overrides: Partial<Item> = {}): Item => ({
  id: 'w1',
  student: { id: 's1', displayName: 'Олена Коваль' },
  amountKopecks: 50_000,
  cardNumber: '4111111111111111',
  cardLast4: '1111',
  status: 'requested',
  createdAt: '2026-11-19T10:00:00Z',
  processedAt: null,
  reason: null,
  ...overrides,
});

beforeEach(() => {
  items = [item()];
  calls = [];
  decisionResponse = null;
  queueResponse = null;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith('/api/mod/withdrawals?status=')) {
        if (queueResponse) return queueResponse();
        const status = url.split('=')[1];
        return json({ withdrawals: items.filter((i) => i.status === status) });
      }
      const decision = url.match(/^\/api\/mod\/withdrawals\/(.+)\/(mark-paid|reject)$/);
      if (decision && init?.method === 'POST') {
        const body = init.body ? JSON.parse(String(init.body)) : {};
        calls.push({ url, body });
        if (decisionResponse) return decisionResponse();
        const target = items.find((i) => i.id === decision[1])!;
        target.status = decision[2] === 'mark-paid' ? 'paid' : 'rejected';
        target.cardNumber = null;
        target.reason = decision[2] === 'reject' ? (body as { reason: string }).reason : null;
        return json({ withdrawal: target });
      }
      return json({ status: 'ok' });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const open = () => render(<RouterProvider router={createTestRouter(['/mod/withdrawals'])} future={providerFuture} />);

describe('/mod/withdrawals: the moderator pays or rejects a request (US-36, A-10)', () => {
  it('US-36 A-10 a requested withdrawal shows the student, the amount and the full card in groups of four (OQ-42)', async () => {
    open();
    const card = await screen.findByRole('article', { name: /500 грн для Олена Коваль/ });
    expect(within(card).getByText('4111 1111 1111 1111')).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'Олена Коваль' })).toHaveAttribute('href', '/u/s1');
    expect(within(card).getByText(/Статус: Очікує виплати/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Заявки на виведення' })).toBeInTheDocument();
  });

  it('US-36 A-10 «Позначити виплаченою» sends the decision, confirms it and the item leaves the open queue', async () => {
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole('button', { name: 'Позначити виплаченою' }));

    expect(await screen.findByText('Заявку позначено виплаченою.')).toHaveAttribute('role', 'status');
    expect(calls).toEqual([{ url: '/api/mod/withdrawals/w1/mark-paid', body: {} }]);
    expect(await screen.findByText('Заявок зі статусом «Очікує виплати» немає.')).toBeInTheDocument();
  });

  it('US-36 A-10 «Відхилити» asks for a reason: empty is refused here, a reason is sent and the money is said to be back', async () => {
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole('button', { name: 'Відхилити' }));
    await user.click(screen.getByRole('button', { name: 'Підтвердити відхилення' }));

    const field = screen.getByLabelText('Причина для студента');
    expect(screen.getByRole('alert')).toHaveTextContent('Вкажіть причину відхилення');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(calls).toHaveLength(0);

    await user.type(field, 'Картка заблокована банком');
    await user.click(screen.getByRole('button', { name: 'Підтвердити відхилення' }));

    expect(await screen.findByText('Заявку відхилено, гроші повернуто на баланс студента.')).toHaveAttribute('role', 'status');
    expect(calls).toEqual([{ url: '/api/mod/withdrawals/w1/reject', body: { reason: 'Картка заблокована банком' } }]);
  });

  it('US-36 INV-24 a request another moderator already decided: «Рішення вже ухвалено» is shown', async () => {
    decisionResponse = () => apiError('ALREADY_DECIDED', 409);
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole('button', { name: 'Позначити виплаченою' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Рішення вже ухвалено');
  });

  it('US-36 A-10 the filter shows paid requests with the last four digits only and no decision buttons', async () => {
    items = [item({ id: 'w9', status: 'paid', cardNumber: null, processedAt: '2026-11-19T12:00:00Z' })];
    const user = userEvent.setup();
    open();
    await screen.findByText('Заявок зі статусом «Очікує виплати» немає.');

    await user.selectOptions(screen.getByLabelText('Показати'), 'paid');

    const card = await screen.findByRole('article', { name: /500 грн для Олена Коваль/ });
    expect(within(card).getByText(/•••• 1111/)).toBeInTheDocument();
    expect(within(card).queryByRole('button')).not.toBeInTheDocument();
  });

  it('US-36 INV-25 a user who is not a moderator gets 403 ROLE_FORBIDDEN: «Доступ заборонено» and no queue', async () => {
    queueResponse = () => apiError('ROLE_FORBIDDEN', 403);
    open();
    expect(await screen.findByRole('alert')).toHaveTextContent('Доступ заборонено');
    expect(screen.queryByRole('list', { name: 'Заявки на виведення' })).not.toBeInTheDocument();
  });
});
