import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestRouter, providerFuture } from '../src/app/router';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const apiError = (code: string, status = 400) => json({ error: { code, message: 'x' } }, status);

let confirmResponse: () => Response;
let resendResponse: () => Response;
let confirmCalls: unknown[];
let resendCalls: unknown[];

beforeEach(() => {
  confirmCalls = [];
  resendCalls = [];
  confirmResponse = () => json({ user: { id: '1', role: 'student', displayName: 'Олена', emailConfirmed: true } });
  resendResponse = () => new Response(null, { status: 202 });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/auth/confirm-email') {
        confirmCalls.push(JSON.parse(String(init?.body)));
        return confirmResponse();
      }
      if (url === '/api/auth/resend-confirmation') {
        resendCalls.push(JSON.parse(String(init?.body)));
        return resendResponse();
      }
      return json({ status: 'ok' });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const open = (query: string) => render(<RouterProvider router={createTestRouter([`/confirm-email${query}`])} future={providerFuture} />);

describe('/confirm-email page (US-07)', () => {
  it('US-07 sc.1 a valid link confirms the email and shows the success page with a way to log in', async () => {
    open('?token=abc123');

    expect(await screen.findByText('Пошту підтверджено. Тепер ви можете увійти.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Увійти' })).toHaveAttribute('href', '/login');
    expect(confirmCalls).toEqual([{ token: 'abc123' }]);
  });

  it('US-07 sc.1 the token is sent once', async () => {
    open('?token=abc123');
    await screen.findByText('Пошту підтверджено. Тепер ви можете увійти.');
    expect(confirmCalls).toHaveLength(1);
  });

  it('US-07 sc.1 a used or unknown link shows TOKEN_INVALID', async () => {
    confirmResponse = () => apiError('TOKEN_INVALID');
    open('?token=used');

    expect(await screen.findByText('Посилання недійсне')).toBeInTheDocument();
  });

  it('US-07 sc.1 a page opened without a token shows TOKEN_INVALID and calls nothing', async () => {
    open('');

    expect(await screen.findByText('Посилання недійсне')).toBeInTheDocument();
    expect(confirmCalls).toHaveLength(0);
  });

  it('US-07 sc.2 an expired link shows the error and offers to resend', async () => {
    confirmResponse = () => apiError('TOKEN_EXPIRED');
    open('?token=old');

    expect(await screen.findByText('Термін дії посилання минув. Надіслати лист повторно?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Надіслати лист повторно' })).toBeEnabled();
  });

  it('US-07 sc.3 the resend form sends the email address and confirms a new email was sent', async () => {
    confirmResponse = () => apiError('TOKEN_EXPIRED');
    const user = userEvent.setup();
    open('?token=old');

    await user.type(await screen.findByLabelText('Електронна пошта'), 'user@university.edu.ua');
    await user.click(screen.getByRole('button', { name: 'Надіслати лист повторно' }));

    expect(await screen.findByText('Ми надіслали новий лист. Перевірте пошту.')).toBeInTheDocument();
    expect(resendCalls).toEqual([{ email: 'user@university.edu.ua' }]);
  });

  it('US-07 sc.3 a malformed address is rejected in the form and not sent', async () => {
    confirmResponse = () => apiError('TOKEN_EXPIRED');
    const user = userEvent.setup();
    open('?token=old');

    await user.type(await screen.findByLabelText('Електронна пошта'), 'nope');
    await user.click(screen.getByRole('button', { name: 'Надіслати лист повторно' }));

    expect(await screen.findByText('Перевірте правильність заповнення полів')).toBeInTheDocument();
    expect(resendCalls).toHaveLength(0);
  });

  it.each([
    ['EMAIL_ALREADY_CONFIRMED', 409, 'Пошту вже підтверджено'],
    ['RATE_LIMITED', 429, 'Забагато спроб. Спробуйте пізніше'],
  ])('US-07 sc.3 the API code %s is shown by its Ukrainian text', async (code, status, text) => {
    confirmResponse = () => apiError('TOKEN_EXPIRED');
    resendResponse = () => apiError(code, status);
    const user = userEvent.setup();
    open('?token=old');

    await user.type(await screen.findByLabelText('Електронна пошта'), 'user@university.edu.ua');
    await user.click(screen.getByRole('button', { name: 'Надіслати лист повторно' }));

    expect(await screen.findByText(text)).toBeInTheDocument();
  });
});
