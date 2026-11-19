import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestRouter, providerFuture } from '../src/app/router';

/**
 * US-36 on `/me/finance`: the withdrawal form (sc.1 confirm and create, sc.2 card error at the field, sc.3 not enough money) and
 * the list of the student's requests. Only `fetch` is mocked; the API itself is covered in apps/api/tests/payments/withdrawals.test.ts.
 */

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const apiError = (code: string, status: number) => json({ error: { code, message: 'x' } }, status);

interface Withdrawal {
  id: string;
  amountKopecks: number;
  cardLast4: string;
  status: 'requested' | 'paid' | 'rejected';
  createdAt: string;
  processedAt: string | null;
  reason: string | null;
}

let available: number;
let withdrawals: Withdrawal[];
let postResponse: ((body: { amountKopecks: number; cardNumber: string }) => Response) | null;
let posted: unknown[];

beforeEach(() => {
  available = 80_000;
  withdrawals = [];
  posted = [];
  postResponse = null;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/me/finance') return json({ balance: { availableKopecks: available }, tasks: [] });
      if (url === '/api/me/withdrawals' && init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as { amountKopecks: number; cardNumber: string };
        posted.push(body);
        if (postResponse) return postResponse(body);
        available -= body.amountKopecks;
        const created: Withdrawal = {
          id: `w${posted.length}`,
          amountKopecks: body.amountKopecks,
          cardLast4: body.cardNumber.slice(-4),
          status: 'requested',
          createdAt: '2026-11-19T10:00:00Z',
          processedAt: null,
          reason: null,
        };
        withdrawals = [created, ...withdrawals];
        return json({ withdrawal: created, balance: { availableKopecks: available } }, 201);
      }
      if (url === '/api/me/withdrawals') return json({ withdrawals });
      return json({ status: 'ok' });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const open = () => render(<RouterProvider router={createTestRouter(['/me/finance'])} future={providerFuture} />);
const balanceText = () => screen.getByRole('region', { name: 'Доступно до виведення' });

async function fill(amount: string, card: string) {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('Сума, грн'), amount);
  await user.type(screen.getByLabelText('Номер української банківської картки'), card);
  await user.click(screen.getByRole('button', { name: 'Вивести кошти' }));
  return user;
}

describe('/me/finance: withdrawal to a card (US-36)', () => {
  it('US-36 sc.1 «Вивести кошти» asks to confirm, «Підтвердити» creates the request: the balance goes down and the request is listed as «Очікує виплати»', async () => {
    open();
    expect(await screen.findByText('Заявок на виведення ще немає.')).toBeInTheDocument();

    const user = await fill('500', '4111 1111 1111 1111');

    const confirm = screen.getByRole('group', { name: 'Підтвердження виведення' });
    expect(confirm).toHaveTextContent(/Вивести 500 грн на картку •••• 1111\?/);
    expect(posted).toHaveLength(0); // nothing is sent before the confirmation
    await user.click(within(confirm).getByRole('button', { name: 'Підтвердити' }));

    const done = await screen.findByText(/Заявку на виведення 500 грн на картку •••• 1111 створено/);
    expect(done).toHaveAttribute('role', 'status');
    expect(posted).toEqual([{ amountKopecks: 50_000, cardNumber: '4111111111111111' }]);
    const list = await screen.findByRole('list', { name: 'Мої заявки на виведення' });
    expect(within(list).getByText(/Очікує виплати/)).toBeInTheDocument();
    expect(within(list).getByText(/•••• 1111/)).toBeInTheDocument();
    expect(balanceText()).toHaveTextContent(/300 грн/);
    expect(screen.getByLabelText('Номер української банківської картки')).toHaveValue('');
  });

  it('US-36 sc.1 «Скасувати» closes the confirmation and sends nothing', async () => {
    open();
    const user = await fill('100', '4111111111111111');
    await user.click(screen.getByRole('button', { name: 'Скасувати' }));
    expect(screen.queryByRole('group', { name: 'Підтвердження виведення' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Вивести кошти' })).toBeEnabled();
    expect(posted).toHaveLength(0);
  });

  it('US-36 sc.2 a card with a wrong checksum is refused at the field before anything is sent', async () => {
    open();
    await fill('100', '4111 1111 1111 1112');

    const card = screen.getByLabelText('Номер української банківської картки');
    const error = screen.getByRole('alert');
    expect(error).toHaveTextContent('Невірний формат української банківської картки');
    expect(card).toHaveAttribute('aria-invalid', 'true');
    expect(card.getAttribute('aria-describedby')).toContain(error.id);
    expect(screen.queryByRole('group', { name: 'Підтвердження виведення' })).not.toBeInTheDocument();
    expect(posted).toHaveLength(0);
  });

  it('US-36 sc.2 a card the server refuses with CARD_INVALID is shown at the card field', async () => {
    postResponse = () => apiError('CARD_INVALID', 400);
    open();
    const user = await fill('100', '4111111111111111');
    await user.click(screen.getByRole('button', { name: 'Підтвердити' }));

    const card = screen.getByLabelText('Номер української банківської картки');
    expect(await screen.findByRole('alert')).toHaveTextContent('Невірний формат української банківської картки');
    expect(card).toHaveAttribute('aria-invalid', 'true');
  });

  it('US-36 sc.3 more than the balance: the server refuses with «Недостатньо коштів на балансі для виведення» and nothing is listed', async () => {
    available = 30_000;
    postResponse = () => apiError('INSUFFICIENT_BALANCE', 422);
    open();
    const user = await fill('500', '4111111111111111');
    await user.click(screen.getByRole('button', { name: 'Підтвердити' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Недостатньо коштів на балансі для виведення');
    expect(screen.getByText('Заявок на виведення ще немає.')).toBeInTheDocument();
    expect(balanceText()).toHaveTextContent(/300 грн/);
  });

  it('US-36 an amount that is not a number of UAH is refused at the field', async () => {
    open();
    await fill('abc', '4111111111111111');
    expect(screen.getByRole('alert')).toHaveTextContent('Вкажіть суму в гривнях');
    expect(screen.getByLabelText('Сума, грн')).toHaveAttribute('aria-invalid', 'true');
    expect(posted).toHaveLength(0);
  });

  it('US-36 the buttons are off while the request is being sent', async () => {
    let release: (r: Response) => void = () => undefined;
    postResponse = () => new Promise<Response>((resolve) => (release = resolve)) as unknown as Response;
    open();
    const user = await fill('100', '4111111111111111');
    await user.click(screen.getByRole('button', { name: 'Підтвердити' }));

    expect(screen.getByRole('button', { name: 'Підтвердити' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Скасувати' })).toBeDisabled();
    release(apiError('INSUFFICIENT_BALANCE', 422));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});

describe('/me/finance: the list of my withdrawals (US-36)', () => {
  it('US-36 each request shows the amount, the last four digits, the Ukrainian status and, if refused, the reason', async () => {
    withdrawals = [
      { id: 'w2', amountKopecks: 20_000, cardLast4: '4444', status: 'rejected', createdAt: '2026-11-19T10:00:00Z', processedAt: '2026-11-19T12:00:00Z', reason: 'Картка заблокована банком' },
      { id: 'w1', amountKopecks: 10_000, cardLast4: '1111', status: 'paid', createdAt: '2026-11-18T10:00:00Z', processedAt: '2026-11-18T12:00:00Z', reason: null },
    ];
    open();

    const items = within(await screen.findByRole('list', { name: 'Мої заявки на виведення' })).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent(/200 грн на картку •••• 4444/);
    expect(items[0]).toHaveTextContent('Статус: Відхилено');
    expect(items[0]).toHaveTextContent('Причина: Картка заблокована банком. Гроші повернуто на баланс.');
    expect(items[1]).toHaveTextContent('Статус: Виплачено');
    expect(items[1]).not.toHaveTextContent('Причина');
  });
});
