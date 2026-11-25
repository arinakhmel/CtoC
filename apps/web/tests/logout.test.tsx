import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestRouter, providerFuture } from '../src/app/router';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const authRequired = () => json({ error: { code: 'AUTH_REQUIRED', message: 'x' } }, 401);
const meBody = (role = 'customer') => json({ user: { id: '1', role, displayName: 'Олена', emailConfirmed: true, studentVerified: false } });

let loggedIn: boolean;
let logoutCalls: number;
let logoutResponse: () => Response;
let otherResponse: () => Response;

beforeEach(() => {
  loggedIn = true;
  logoutCalls = 0;
  logoutResponse = () => {
    loggedIn = false;
    return new Response(null, { status: 204 });
  };
  otherResponse = () => (loggedIn ? json({ tasks: [], nextCursor: null }) : authRequired());
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/me') return loggedIn ? meBody() : authRequired();
      if (url === '/api/auth/logout' && init?.method === 'POST') {
        logoutCalls += 1;
        return logoutResponse();
      }
      if (url === '/api/health') return json({ status: 'ok' });
      return otherResponse();
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const open = (path: string) => render(<RouterProvider router={createTestRouter([path])} future={providerFuture} />);

describe('header: logout (US-46)', () => {
  it('US-46 sc.1 «Вийти» ends the session and opens the landing page as a visitor', async () => {
    const user = userEvent.setup();
    open('/feed');

    await user.click(await screen.findByRole('button', { name: 'Вийти' }));

    expect(await screen.findByRole('link', { name: 'Вхід' })).toBeInTheDocument();
    expect(logoutCalls).toBe(1);
    expect(screen.queryByRole('button', { name: 'Вийти' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Почати безкоштовно' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 1, name: /Landing/i })).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Вхід' })).toBeNull();
  });

  it('US-46 sc.1 a session that is already gone (401 on logout) still ends in the landing page as a visitor', async () => {
    const user = userEvent.setup();
    logoutResponse = () => {
      loggedIn = false;
      return authRequired();
    };
    open('/feed');

    await user.click(await screen.findByRole('button', { name: 'Вийти' }));

    expect(await screen.findByRole('link', { name: 'Вхід' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 1, name: /Landing/i })).toBeInTheDocument();
  });

  it('US-46 a failed logout keeps the user in and says so', async () => {
    const user = userEvent.setup();
    logoutResponse = () => json({ error: { code: 'INTERNAL_ERROR', message: 'x' } }, 500);
    open('/feed');

    await user.click(await screen.findByRole('button', { name: 'Вийти' }));

    expect(await screen.findByText('Не вдалося вийти. Спробуйте ще раз.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Вийти' })).toBeEnabled();
  });

  it('US-46 a visitor has no «Вийти» in the header, only the login and sign-up links', async () => {
    loggedIn = false;
    open('/');

    expect(await screen.findByRole('link', { name: 'Вхід' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Вийти' })).toBeNull();
  });
});

describe('protected pages without a session (US-46)', () => {
  it('US-46 checklist: a protected page sends a visitor to /login with «Увійдіть, щоб продовжити»', async () => {
    loggedIn = false;
    open('/c/balance');

    expect(await screen.findByText('Увійдіть, щоб продовжити')).toBeInTheDocument();
    expect(screen.getByRole('form', { name: 'Вхід' })).toBeInTheDocument();
  });

  it('US-46 checklist: a public page does not redirect a visitor', async () => {
    loggedIn = false;
    open('/terms');

    expect(await screen.findByRole('heading', { level: 1, name: /Terms/i })).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Вхід' })).toBeNull();
  });

  it('US-46 sc.3 a session that expires during an action sends the user to /login with the message', async () => {
    // The page loads for a logged-in user, then the session ends and the next call of the page answers 401.
    otherResponse = () => {
      loggedIn = false;
      return authRequired();
    };
    open('/feed');

    expect(await screen.findByRole('form', { name: 'Вхід' })).toBeInTheDocument();
    expect(screen.getByText('Увійдіть, щоб продовжити')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Вийти' })).toBeNull());
  });

  it('US-46 checklist: after logout a protected page opened in the same tab sends the user to /login with the message', async () => {
    const user = userEvent.setup();
    open('/feed');
    await user.click(await screen.findByRole('button', { name: 'Вийти' }));
    expect(await screen.findByRole('heading', { level: 1, name: /Landing/i })).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: '/c/balance' }));

    expect(await screen.findByRole('form', { name: 'Вхід' })).toBeInTheDocument();
    expect(screen.getByText('Увійдіть, щоб продовжити')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Вийти' })).toBeNull();
  });

  it('US-46 sc.3 a session that ends while an action is sent (a mutation answers 401) opens /login with the message', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === '/api/me') return loggedIn ? meBody() : authRequired();
        if (url === '/api/me/balance/sandbox-topup' && init?.method === 'POST') {
          loggedIn = false; // the session has expired by the time the action is sent
          return authRequired();
        }
        if (url === '/api/me/balance') return json({ balance: { availableKopecks: 50_000 } });
        return json({ status: 'ok' });
      }),
    );
    open('/c/balance');

    await user.type(await screen.findByLabelText('Сума, грн'), '10');
    await user.click(screen.getByRole('button', { name: 'Поповнити (тест)' }));

    expect(await screen.findByRole('form', { name: 'Вхід' })).toBeInTheDocument();
    expect(screen.getByText('Увійдіть, щоб продовжити')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Вийти' })).toBeNull());
  });

  it('US-46 sc.3 after the redirect the user can log in again and the header shows «Вийти»', async () => {
    const user = userEvent.setup();
    loggedIn = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/api/me') return loggedIn ? meBody('student') : authRequired();
        if (url === '/api/auth/login') {
          loggedIn = true;
          return meBody('student');
        }
        return json({ tasks: [], nextCursor: null });
      }),
    );
    open('/feed');

    await user.type(await screen.findByLabelText('Електронна пошта'), 'user@university.edu.ua');
    await user.type(screen.getByLabelText('Пароль'), 'secret-pass');
    await user.click(screen.getByRole('button', { name: 'Увійти' }));

    expect(await screen.findByRole('button', { name: 'Вийти' })).toBeInTheDocument();
  });
});
