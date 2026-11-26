import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestRouter, providerFuture } from '../src/app/router';

/** US-03: the commission on /terms for a visitor and the moderator's form on /mod/settings. Only `fetch` is mocked. */

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const apiError = (code: string, status: number) => json({ error: { code, message: 'x' } }, status);

let commissionBp: number;
let publicResponse: (() => Response) | null;
let putResponse: (() => Response) | null;
let puts: unknown[];
let publicCalls: number;

beforeEach(() => {
  commissionBp = 1000;
  publicResponse = null;
  putResponse = null;
  puts = [];
  publicCalls = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/public/settings') {
        publicCalls += 1;
        return publicResponse ? publicResponse() : json({ commissionBp });
      }
      if (url === '/api/mod/settings' && init?.method === 'PUT') {
        puts.push(JSON.parse(String(init.body)));
        if (putResponse) return putResponse();
        commissionBp = (puts.at(-1) as { commissionBp: number }).commissionBp;
        return json({ commissionBp });
      }
      if (url === '/api/mod/settings') return json({ commissionBp });
      return json({ status: 'ok' });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const open = (path: string) => render(<RouterProvider router={createTestRouter([path])} future={providerFuture} />);

describe('/terms: the commission for a visitor (US-03 sc.1, sc.2)', () => {
  it('US-03 sc.1 a visitor sees the commission as digits in percent', async () => {
    open('/terms');

    expect(await screen.findByText('10%')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Умови та поточна комісія' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Комісія платформи' })).toBeInTheDocument();
  });

  it('US-03 sc.1 a rate with a fraction is shown with it: 12,5%', async () => {
    commissionBp = 1250;
    open('/terms');

    expect(await screen.findByText('12,5%')).toBeInTheDocument();
  });

  it('US-03 sc.1 a rate of 0 is shown as 0%, not hidden', async () => {
    commissionBp = 0;
    open('/terms');

    expect(await screen.findByText('0%')).toBeInTheDocument();
  });

  it('US-03 sc.2 without an answer the page shows an error and no invented number', async () => {
    publicResponse = () => apiError('INTERNAL_ERROR', 500);
    open('/terms');

    expect(await screen.findByRole('alert')).toHaveTextContent('Щось пішло не так');
    expect(screen.queryByText(/\d+%/)).toBeNull();
  });

  it('US-03 sc.2 after an error the visitor can ask again, and the rate then appears', async () => {
    const user = userEvent.setup();
    publicResponse = () => apiError('INTERNAL_ERROR', 500);
    open('/terms');
    expect(await screen.findByRole('alert')).toHaveTextContent('Щось пішло не так');

    publicResponse = null;
    await user.click(screen.getByRole('button', { name: 'Спробувати ще раз' }));

    expect(await screen.findByText('10%')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('US-03 sc.2 with no connection the page says so and shows no number', async () => {
    publicResponse = () => {
      throw new TypeError('fetch failed');
    };
    open('/terms');

    // The query client asks again twice after a network error (1 s and 2 s), then the page shows the error.
    expect(await screen.findByRole('alert', {}, { timeout: 6000 })).toHaveTextContent('Немає зв’язку із сервером');
    expect(screen.queryByText(/\d+%/)).toBeNull();
  }, 10_000);
});

describe('/mod/settings: the moderator changes the commission (US-03 sc.3)', () => {
  it('US-03 sc.3 the form starts from the stored rate and saving sends basis points and confirms it', async () => {
    const user = userEvent.setup();
    open('/mod/settings');

    const field = await screen.findByLabelText('Комісія, %');
    await vi.waitFor(() => expect(field).toHaveValue('10'));
    await user.clear(field);
    await user.type(field, '12,5');
    await user.click(screen.getByRole('button', { name: 'Зберегти' }));

    expect(await screen.findByText('Збережено: 12,5%')).toHaveAttribute('role', 'status');
    expect(puts).toEqual([{ commissionBp: 1250 }]);
  });

  it('US-03 sc.3 editing the field removes the old «Збережено» confirmation', async () => {
    const user = userEvent.setup();
    open('/mod/settings');
    const field = await screen.findByLabelText('Комісія, %');
    await vi.waitFor(() => expect(field).toHaveValue('10'));
    await user.clear(field);
    await user.type(field, '12');
    await user.click(screen.getByRole('button', { name: 'Зберегти' }));
    expect(await screen.findByText('Збережено: 12%')).toBeInTheDocument();

    await user.type(field, '5');

    expect(screen.queryByText(/Збережено/)).toBeNull();
  });

  it('US-03 sc.3 editing the field removes the old server error', async () => {
    const user = userEvent.setup();
    putResponse = () => apiError('INTERNAL_ERROR', 500);
    open('/mod/settings');
    const field = await screen.findByLabelText('Комісія, %');
    await vi.waitFor(() => expect(field).toHaveValue('10'));
    await user.click(screen.getByRole('button', { name: 'Зберегти' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    await user.clear(field);
    await user.type(field, '15');

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('US-03 sc.3 if the stored rate cannot be read the moderator can try again', async () => {
    const user = userEvent.setup();
    let fail = true;
    const base = globalThis.fetch as unknown as (url: string, init?: RequestInit) => Promise<Response>;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => (url === '/api/mod/settings' && !init?.method && fail ? apiError('INTERNAL_ERROR', 500) : base(url, init))));
    open('/mod/settings');
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    fail = false;
    await user.click(screen.getByRole('button', { name: 'Спробувати ще раз' }));

    expect(await screen.findByLabelText('Комісія, %')).toBeInTheDocument();
  });

  it('US-03 sc.3 a rate over the limit or not a number shows the error and sends nothing', async () => {
    const user = userEvent.setup();
    open('/mod/settings');
    const field = await screen.findByLabelText('Комісія, %');

    for (const text of ['51', 'abc', '1e1', '-1', '10,123', '']) {
      await user.clear(field);
      if (text) await user.type(field, text);
      await user.click(screen.getByRole('button', { name: 'Зберегти' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Перевірте правильність заповнення полів');
    }
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(puts).toEqual([]);
  });

  it('US-03 sc.3 the limits 0 and 50 are accepted', async () => {
    const user = userEvent.setup();
    open('/mod/settings');
    const field = await screen.findByLabelText('Комісія, %');

    for (const [text, bp] of [['0', 0], ['50', 5000]] as const) {
      await user.clear(field);
      await user.type(field, text);
      await user.click(screen.getByRole('button', { name: 'Зберегти' }));
      await vi.waitFor(() => expect(puts.at(-1)).toEqual({ commissionBp: bp }));
    }
  });

  it('US-03 sc.3 the answer of the server VALIDATION_FAILED is shown by its Ukrainian text', async () => {
    putResponse = () => apiError('VALIDATION_FAILED', 400);
    const user = userEvent.setup();
    open('/mod/settings');
    const field = await screen.findByLabelText('Комісія, %');
    await user.clear(field);
    await user.type(field, '15');
    await user.click(screen.getByRole('button', { name: 'Зберегти' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Перевірте правильність заповнення полів');
    expect(screen.queryByText(/Збережено/)).toBeNull();
  });

  it('US-03 sc.3 a user who may not (403 ROLE_FORBIDDEN) is told so, and the form does not appear', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => (url === '/api/mod/settings' ? apiError('ROLE_FORBIDDEN', 403) : json({ status: 'ok' }))),
    );
    open('/mod/settings');

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Комісія платформи' })).toBeNull();
  });

  it('US-03 sc.3 after the change /terms asks for the rate again and shows the new value, not the old one', async () => {
    const user = userEvent.setup();
    const first = open('/terms');
    expect(await screen.findByText('10%')).toBeInTheDocument();
    first.unmount();

    const second = open('/mod/settings');
    const field = await screen.findByLabelText('Комісія, %');
    await user.clear(field);
    await user.type(field, '15');
    await user.click(screen.getByRole('button', { name: 'Зберегти' }));
    await screen.findByText('Збережено: 15%');
    second.unmount();

    const before = publicCalls;
    render(<RouterProvider router={createTestRouter(['/terms'])} future={providerFuture} />);
    expect(await screen.findByText('15%')).toBeInTheDocument();
    expect(publicCalls).toBeGreaterThan(before);
  });
});
