import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestRouter, providerFuture } from '../src/app/router';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

let registerResponse: () => Response;
let registerCalls: unknown[];

beforeEach(() => {
  registerCalls = [];
  registerResponse = () => json({ user: { id: '1', role: 'student', displayName: 'Олена', emailConfirmed: false } }, 201);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/auth/register') {
        registerCalls.push(JSON.parse(String(init?.body)));
        return registerResponse();
      }
      return json({ status: 'ok' });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

async function fillAndSubmit(email: string, password = 'secret-pass') {
  const user = userEvent.setup();
  render(<RouterProvider router={createTestRouter(['/register'])} future={providerFuture} />);
  await user.type(await screen.findByLabelText('Електронна пошта'), email);
  await user.type(screen.getByLabelText('Ім’я для відображення'), 'Олена Коваль');
  await user.type(screen.getByLabelText('Пароль'), password);
  await user.click(screen.getByRole('button', { name: 'Зареєструватися' }));
}

describe('/register form (US-06)', () => {
  it('US-06 sc.1 a university email is sent to the API and the confirmation notice is shown', async () => {
    await fillAndSubmit('user@university.edu.ua');

    expect(await screen.findByText(/Ми надіслали лист для підтвердження/)).toBeInTheDocument();
    expect(registerCalls).toEqual([
      { role: 'student', email: 'user@university.edu.ua', displayName: 'Олена Коваль', password: 'secret-pass' },
    ]);
  });

  it('US-06 sc.2 a public email shows the university-only message and is not sent', async () => {
    await fillAndSubmit('test@gmail.com');

    expect(await screen.findByText('Дозволено реєстрацію лише з використанням університетської електронної пошти')).toBeInTheDocument();
    expect(registerCalls).toHaveLength(0);
  });

  it('US-06 sc.2 the API code EMAIL_DOMAIN_NOT_ALLOWED (domain not on the allow-list) is shown at the email field', async () => {
    registerResponse = () =>
      json(
        { error: { code: 'EMAIL_DOMAIN_NOT_ALLOWED', message: 'x', details: [{ field: 'email', code: 'EMAIL_DOMAIN_NOT_ALLOWED' }] } },
        400,
      );
    await fillAndSubmit('a@unknown.edu.ua');

    expect(await screen.findByText('Дозволено реєстрацію лише з використанням університетської електронної пошти')).toBeInTheDocument();
    expect(screen.getByLabelText('Електронна пошта')).toHaveAttribute('aria-invalid', 'true');
  });

  it('US-06 sc.3 the API code EMAIL_TAKEN is shown at the email field', async () => {
    registerResponse = () =>
      json({ error: { code: 'EMAIL_TAKEN', message: 'x', details: [{ field: 'email', code: 'EMAIL_TAKEN' }] } }, 409);
    await fillAndSubmit('user@university.edu.ua');

    expect(await screen.findByText('Ця електронна пошта вже використовується')).toBeInTheDocument();
    expect(screen.queryByText(/Ми надіслали/)).toBeNull();
  });

  it('US-06 RATE_LIMITED is shown as a general error', async () => {
    registerResponse = () => json({ error: { code: 'RATE_LIMITED', message: 'x' } }, 429);
    await fillAndSubmit('user@university.edu.ua');

    expect(await screen.findByText('Забагато спроб. Спробуйте пізніше')).toBeInTheDocument();
  });
});
