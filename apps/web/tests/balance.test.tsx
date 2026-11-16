import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestRouter, providerFuture } from '../src/app/router';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const apiError = (code: string, status: number) => json({ error: { code, message: 'x' } }, status);

let available: number;
let balanceResponse: (() => Response) | null;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  available = 50_000;
  balanceResponse = null;
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/me/balance/sandbox-topup' && init?.method === 'POST') {
      available += (JSON.parse(String(init.body)) as { amountKopecks: number }).amountKopecks;
      return json({ balance: { availableKopecks: available } });
    }
    if (url === '/api/me/balance') return balanceResponse ? balanceResponse() : json({ balance: { availableKopecks: available } });
    return json({ status: 'ok' });
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const open = () => render(<RouterProvider router={createTestRouter(['/c/balance'])} future={providerFuture} />);
const posts = () => fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST');
const field = () => screen.findByLabelText('Сума, грн');

describe('/c/balance amount field (US-26)', () => {
  it.each(['1e3', '0x10', '10.999', 'abc', '-5'])('US-26 sc.2 the text «%s» is not an amount: an error is shown and nothing is sent', async (text) => {
    const user = userEvent.setup();
    open();

    await user.type(await field(), text);
    await user.click(screen.getByRole('button', { name: 'Поповнити (тест)' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(posts()).toHaveLength(0);
  });

  it('US-26 a comma and two decimals are an amount: 10,50 is sent as 1050 kopecks', async () => {
    const user = userEvent.setup();
    open();

    await user.type(await field(), '10,50');
    await user.click(screen.getByRole('button', { name: 'Поповнити (тест)' }));

    expect(await screen.findByText('Баланс поповнено на 10,50 грн.')).toBeInTheDocument();
    expect(JSON.parse(String(posts()[0]![1].body))).toEqual({ amountKopecks: 1050 });
  });
});

describe('/c/balance (US-26)', () => {
  it('US-26 the page shows the available balance and says it is a test mode with no real money', async () => {
    open();

    expect(await screen.findByText('500 грн')).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent('Тестовий режим');
    expect(screen.getByRole('note')).toHaveTextContent('не списує реальні гроші');
    expect(screen.getByRole('heading', { level: 1, name: 'Баланс і тестове поповнення' })).toBeInTheDocument();
  });

  it('US-26 sc.1 an amount in UAH is sent as kopecks, the new balance is shown and the field is cleared', async () => {
    const user = userEvent.setup();
    open();

    await user.type(await field(), '250');
    await user.click(screen.getByRole('button', { name: 'Поповнити (тест)' }));

    expect(await screen.findByText('Баланс поповнено на 250 грн.')).toBeInTheDocument();
    expect(JSON.parse(String(posts()[0]?.[1]?.body))).toEqual({ amountKopecks: 25_000 });
    expect(await screen.findByText('750 грн')).toBeInTheDocument();
    expect(screen.getByLabelText('Сума, грн')).toHaveValue('');
  });

  it('US-26 a comma is accepted as the decimal sign: 1,5 is 150 kopecks', async () => {
    const user = userEvent.setup();
    open();

    await user.type(await field(), '1,5');
    await user.click(screen.getByRole('button', { name: 'Поповнити (тест)' }));

    await screen.findByText('Баланс поповнено на 1,50 грн.');
    expect(JSON.parse(String(posts()[0]?.[1]?.body))).toEqual({ amountKopecks: 150 });
  });

  it.each([
    ['empty', ''],
    ['under 1 UAH', '0,5'],
    ['over the maximum', '20001'],
    ['not a number', 'abc'],
  ])('US-26 an amount that is %s is blocked with a message and nothing is sent', async (_name, text) => {
    const user = userEvent.setup();
    open();

    if (text) await user.type(await field(), text);
    await user.click(await screen.findByRole('button', { name: 'Поповнити (тест)' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Перевірте правильність заповнення полів');
    expect(screen.getByLabelText('Сума, грн')).toHaveAttribute('aria-invalid', 'true');
    expect(posts()).toHaveLength(0);
  });

  it('US-26 the hint names the limits from 1 грн to 20 000 грн', async () => {
    open();
    expect(await screen.findByText(/Від 1 грн до 20\s?000 грн/)).toBeInTheDocument();
  });

  it('US-26 EMAIL_NOT_CONFIRMED shows its message and a link to confirm the email', async () => {
    balanceResponse = () => apiError('EMAIL_NOT_CONFIRMED', 403);
    open();

    expect(await screen.findByRole('alert')).toHaveTextContent('Спершу підтвердіть пошту');
    expect(screen.getByRole('link', { name: 'Підтвердити пошту' })).toHaveAttribute('href', '/confirm-email');
  });

  it('US-26 sc.2 the page links back to the customer\'s tasks, where the select can be tried again', async () => {
    open();
    expect(await screen.findByRole('link', { name: 'До моїх завдань' })).toHaveAttribute('href', '/c/tasks');
  });
});
