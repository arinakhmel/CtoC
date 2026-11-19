import { render, screen, within } from '@testing-library/react';
import { RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestRouter, providerFuture } from '../src/app/router';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const apiError = (code: string, status: number) => json({ error: { code, message: 'x' } }, status);

interface Row {
  taskId: string;
  title: string;
  grossKopecks: number;
  commissionKopecks: number;
  netKopecks: number;
  paidAt: string;
}
const row = (overrides: Partial<Row> = {}): Row => ({
  taskId: 't1',
  title: 'Логотип для кав’ярні',
  grossKopecks: 100_000,
  commissionKopecks: 10_000,
  netKopecks: 90_000,
  paidAt: '2026-11-18T10:00:00Z',
  ...overrides,
});

let available: number;
let tasks: Row[];
let financeResponse: (() => Response) | null;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  available = 0;
  tasks = [];
  financeResponse = null;
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    // The customer accepts the result: the student is credited the net amount (the API does this in one transaction).
    if (url === '/api/tasks/t1/accept' && init?.method === 'POST') {
      available += 90_000;
      tasks = [row()];
      return json({ task: { id: 't1', status: 'done' } });
    }
    if (url === '/api/me/finance') return financeResponse ? financeResponse() : json({ balance: { availableKopecks: available }, tasks });
    if (url === '/api/me/withdrawals') return json({ withdrawals: [] }); // US-36, on the same page
    return json({ status: 'ok' });
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const open = () => render(<RouterProvider router={createTestRouter(['/me/finance'])} future={providerFuture} />);
/** The row of one amount: its label (the term) and its value, as the student reads them together. */
const amountRow = (card: HTMLElement, label: string) => within(card).getByText(label).closest('div')!;

describe('/me/finance: the breakdown of a payment (US-35 sc.3)', () => {
  it('US-35 sc.3 the total, the platform commission and the amount to receive are all in the document, each with its label', async () => {
    tasks = [row()];
    available = 90_000;
    open();

    const card = await screen.findByRole('article', { name: 'Логотип для кав’ярні' });

    expect(amountRow(card, 'Загальна сума')).toHaveTextContent(/1\s000 грн/);
    expect(amountRow(card, 'Комісія платформи')).toHaveTextContent(/100 грн/);
    expect(amountRow(card, 'До отримання')).toHaveTextContent(/900 грн/);
    expect(within(card).getByText('18.11.2026')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Фінанси' })).toBeInTheDocument();
  });

  it('US-35 sc.3 odd kopecks are shown with two decimals by the one money formatter, and a commission of 0 as «0 грн»', async () => {
    tasks = [
      row({ taskId: 't1', title: 'Перше завдання', grossKopecks: 99_999, commissionKopecks: 10_000, netKopecks: 89_999 }),
      row({ taskId: 't2', title: 'Друге завдання', grossKopecks: 5, commissionKopecks: 0, netKopecks: 5 }),
    ];
    open();

    const first = await screen.findByRole('article', { name: 'Перше завдання' });
    const second = screen.getByRole('article', { name: 'Друге завдання' });

    expect(amountRow(first, 'Загальна сума')).toHaveTextContent(/999,99 грн/);
    expect(amountRow(first, 'До отримання')).toHaveTextContent(/899,99 грн/);
    expect(amountRow(second, 'Загальна сума')).toHaveTextContent(/0,05 грн/);
    expect(amountRow(second, 'Комісія платформи')).toHaveTextContent(/^Комісія платформи0 грн$/);
  });

  it('US-35 sc.3 the tasks keep the order of the API, newest first', async () => {
    tasks = [row({ taskId: 'a', title: 'Нова задача' }), row({ taskId: 'b', title: 'Стара задача' })];
    open();

    const list = await screen.findByRole('list', { name: 'Виплати за завдання' });

    expect(within(list).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Нова задача', 'Стара задача']);
  });

  it('US-35 sc.3 a student with no paid task sees the balance 0 and a hint instead of an empty table', async () => {
    open();

    expect(await screen.findByText(/Завершених завдань поки немає/)).toBeInTheDocument();
    const balance = screen.getByRole('region', { name: 'Доступно до виведення' });
    expect(balance).toHaveTextContent(/0 грн/);
  });
});

describe('/me/finance: the credited amount is available (US-34 sc.1)', () => {
  it('US-34 sc.1 after the accept the student sees the credited net amount as «Доступно до виведення»', async () => {
    await fetch('/api/tasks/t1/accept', { method: 'POST' }); // the customer accepts the result
    open();

    const balance = await screen.findByRole('region', { name: 'Доступно до виведення' });

    expect(balance).toHaveTextContent(/900 грн/);
    expect(within(await screen.findByRole('article', { name: 'Логотип для кав’ярні' })).getByText('До отримання').closest('div')).toHaveTextContent(/900 грн/);
  });
});

describe('/me/finance: errors', () => {
  it('a customer gets ROLE_FORBIDDEN as a message, with no balance and no amounts', async () => {
    financeResponse = () => apiError('ROLE_FORBIDDEN', 403);
    open();

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText('Доступно до виведення')).not.toBeInTheDocument();
  });

  it('a student who is not verified is told so and gets the link to the verification', async () => {
    financeResponse = () => apiError('STUDENT_NOT_VERIFIED', 403);
    open();

    expect(await screen.findByRole('link', { name: 'Пройти верифікацію' })).toHaveAttribute('href', '/me/verification');
  });

  it('AUTH_REQUIRED sends the visitor to the login page', async () => {
    financeResponse = () => apiError('AUTH_REQUIRED', 401);
    open();

    expect(await screen.findByRole('heading', { level: 1, name: /^Login/ })).toBeInTheDocument();
  });
});
