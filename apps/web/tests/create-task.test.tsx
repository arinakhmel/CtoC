import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestRouter, providerFuture } from '../src/app/router';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
    init?.method === 'POST' ? json({ task: { id: 't1', status: 'pending_moderation' } }, 201) : json({ status: 'ok' }),
  );
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const open = () => render(<RouterProvider router={createTestRouter(['/c/tasks/new'])} future={providerFuture} />);
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Опублікувати на перевірку' }));
const posts = () => fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'POST');

function fillValid() {
  type('Назва', 'Логотип для кав’ярні');
  type('Опис', 'Потрібен простий логотип.');
  type('Ціна, грн', '400');
  type('Строк виконання', '2030-05-20T15:30');
}

describe('/c/tasks/new (US-16)', () => {
  it('US-16 sc.1 a valid form posts kopecks and an ISO deadline and confirms moderation', async () => {
    open();
    fillValid();
    submit();

    expect(await screen.findByText('Завдання надіслано на модерацію.')).toBeInTheDocument();
    const [url, init] = posts()[0]!;
    expect(url).toBe('/api/tasks');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({ title: 'Логотип для кав’ярні', priceKopecks: 40_000 });
    expect(body.deadlineAt).toMatch(/^\d{4}-\d\d-\d\dT.*Z$/);
    expect(Object.keys(body).sort()).toEqual(['deadlineAt', 'description', 'priceKopecks', 'title']);
  });

  it('US-16 sc.2 an empty description is marked invalid with a message and nothing is sent', async () => {
    open();
    fillValid();
    type('Опис', '');
    submit();

    const field = await screen.findByLabelText('Опис');
    await waitFor(() => expect(field).toHaveAttribute('aria-invalid', 'true'));
    expect(screen.getByText('Перевірте правильність заповнення полів')).toBeInTheDocument();
    expect(screen.getByLabelText('Назва')).toHaveAttribute('aria-invalid', 'false');
    expect(posts()).toHaveLength(0);
  });

  it('US-16 sc.3 a 1-character title shows the minimum length message', async () => {
    open();
    fillValid();
    type('Назва', 'A');
    submit();

    expect(await screen.findByText('Назва занадто коротка')).toBeInTheDocument();
    expect(screen.getByLabelText('Назва')).toHaveAttribute('aria-invalid', 'true');
    expect(posts()).toHaveLength(0);
  });

  it('US-16 a server field error from details is shown on that field', async () => {
    fetchMock.mockImplementation(async () =>
      json({ error: { code: 'VALIDATION_FAILED', message: 'x', details: [{ field: 'description', code: 'VALIDATION_FAILED' }] } }, 400),
    );
    open();
    fillValid();
    submit();

    await waitFor(() => expect(screen.getByLabelText('Опис')).toHaveAttribute('aria-invalid', 'true'));
  });

  it('US-17 checklist the price is a numeric input', () => {
    open();
    expect(screen.getByRole('spinbutton', { name: 'Ціна, грн' })).toBeInTheDocument();
  });

  it('US-17 sc.2 a price of 20 UAH shows the minimum price message and nothing is sent', async () => {
    open();
    fillValid();
    type('Ціна, грн', '20');
    submit();

    expect(await screen.findByText('Мінімальна вартість завдання — 50 грн')).toBeInTheDocument();
    expect(screen.getByLabelText('Ціна, грн')).toHaveAttribute('aria-invalid', 'true');
    expect(posts()).toHaveLength(0);
  });

  it('US-17 sc.3 letters in the price field give a "must be a number" error and nothing is sent', async () => {
    open();
    fillValid();
    // A type=number input drops letters, so the field is empty (jsdom does the same as a browser here).
    type('Ціна, грн', 'abc');
    submit();

    const field = screen.getByLabelText('Ціна, грн');
    await waitFor(() => expect(field).toHaveAttribute('aria-invalid', 'true'));
    expect(screen.getByText('Перевірте правильність заповнення полів')).toBeInTheDocument();
    expect(posts()).toHaveLength(0);
  });

  it('US-16 an unconfirmed email offers the confirmation link', async () => {
    fetchMock.mockImplementation(async () => json({ error: { code: 'EMAIL_NOT_CONFIRMED', message: 'x' } }, 403));
    open();
    fillValid();
    submit();

    expect(await screen.findByRole('link', { name: 'Підтвердити пошту' })).toHaveAttribute('href', '/confirm-email');
  });
});
