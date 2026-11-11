import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestRouter, providerFuture } from '../src/app/router';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const apiError = (code: string, status: number) => json({ error: { code, message: 'x' } }, status);
const sessionUser = (role: string, emailConfirmed = true) =>
  json({ user: { id: '1', role, displayName: 'Олена', emailConfirmed, studentVerified: false } });

let loginResponse: () => Response;
let loginCalls: unknown[];
let resendCalls: unknown[];

beforeEach(() => {
  loginCalls = [];
  resendCalls = [];
  loginResponse = () => sessionUser('student');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/auth/login') {
        loginCalls.push(JSON.parse(String(init?.body)));
        return loginResponse();
      }
      if (url === '/api/auth/resend-confirmation') {
        resendCalls.push(JSON.parse(String(init?.body)));
        return new Response(null, { status: 202 });
      }
      return json({ status: 'ok' });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

async function submit(email = 'user@university.edu.ua', password = 'secret-pass') {
  const user = userEvent.setup();
  render(<RouterProvider router={createTestRouter(['/login'])} future={providerFuture} />);
  await user.type(await screen.findByLabelText('Електронна пошта'), email);
  if (password) await user.type(screen.getByLabelText('Пароль'), password);
  await user.click(screen.getByRole('button', { name: 'Увійти' }));
  return user;
}

describe('/login form (US-45)', () => {
  it.each([
    ['student', 'Task feed'],
    ['customer', 'My tasks'],
    ['moderator', 'Student document queue'],
  ])('US-45 sc.1 a %s is sent to the start page for their role', async (role, heading) => {
    loginResponse = () => sessionUser(role);

    await submit();

    expect(await screen.findByRole('heading', { level: 1, name: new RegExp(heading, 'i') })).toBeInTheDocument();
    expect(loginCalls).toEqual([{ email: 'user@university.edu.ua', password: 'secret-pass' }]);
  });

  it('US-45 sc.1 a user with an unconfirmed email can only resend the confirmation email', async () => {
    loginResponse = () => sessionUser('student', false);

    const user = await submit();

    expect(await screen.findByText(/Спершу підтвердіть пошту/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Пароль')).toBeNull();
    expect(screen.getByLabelText('Електронна пошта')).toHaveValue('user@university.edu.ua');
    await user.click(screen.getByRole('button', { name: 'Надіслати лист повторно' }));
    expect(await screen.findByText('Ми надіслали новий лист. Перевірте пошту.')).toBeInTheDocument();
    expect(resendCalls).toEqual([{ email: 'user@university.edu.ua' }]);
  });

  it('US-45 sc.2 INVALID_CREDENTIALS shows one message that does not say which field is wrong', async () => {
    loginResponse = () => apiError('INVALID_CREDENTIALS', 401);

    await submit();

    expect(await screen.findByText('Невірна пошта або пароль')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Увійти' })).toBeEnabled();
  });

  it('US-45 sc.3 RATE_LIMITED shows the too-many-attempts message', async () => {
    loginResponse = () => apiError('RATE_LIMITED', 429);

    await submit();

    expect(await screen.findByText('Забагато спроб. Спробуйте пізніше')).toBeInTheDocument();
  });

  it('US-45 a malformed email or an empty password is rejected in the form and not sent', async () => {
    await submit('nope', '');

    expect(await screen.findAllByText('Перевірте правильність заповнення полів')).not.toHaveLength(0);
    expect(loginCalls).toHaveLength(0);
  });
});
