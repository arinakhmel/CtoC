import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestRouter, providerFuture } from '../src/app/router';

/** US-39: the moderator's queue `/mod/verifications`. Only `fetch` is mocked. */

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const apiError = (code: string, status: number) => json({ error: { code, message: 'x' } }, status);

interface Item {
  id: string;
  student: { id: string; displayName: string; email: string };
  file: { id: string; originalName: string; mime: string; sizeBytes: number };
  status: 'pending' | 'approved' | 'rejected';
  reason: string | null;
  createdAt: string;
  decidedAt: string | null;
}

let items: Item[];
let calls: { url: string; body: unknown }[];
let decisionResponse: (() => Response) | null;

const item = (overrides: Partial<Item> = {}): Item => ({
  id: 'v1',
  student: { id: 's1', displayName: 'Олена Коваль', email: 'olena@lpnu.ua' },
  file: { id: 'f1', originalName: 'квиток.pdf', mime: 'application/pdf', sizeBytes: 1000 },
  status: 'pending',
  reason: null,
  createdAt: '2026-11-19T10:00:00Z',
  decidedAt: null,
  ...overrides,
});

beforeEach(() => {
  items = [item()];
  calls = [];
  decisionResponse = null;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith('/api/mod/verifications?status=')) return json({ items: items.filter((i) => i.status === url.split('=')[1]) });
      const decision = url.match(/^\/api\/mod\/verifications\/(.+)\/(approve|reject)$/);
      if (decision && init?.method === 'POST') {
        calls.push({ url, body: init.body ? JSON.parse(String(init.body)) : {} });
        if (decisionResponse) return decisionResponse();
        const target = items.find((i) => i.id === decision[1])!;
        target.status = decision[2] === 'approve' ? 'approved' : 'rejected';
        return json({ verification: target });
      }
      return json({ status: 'ok' });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const open = () => render(<RouterProvider router={createTestRouter(['/mod/verifications'])} future={providerFuture} />);

describe('/mod/verifications: the moderator decides on a student document (US-39)', () => {
  it('US-39 the queue shows the name, the email, the date, «Очікує перевірки» and a link to the document', async () => {
    open();
    const row = await screen.findByRole('article', { name: 'Олена Коваль' });
    expect(within(row).getByText(/olena@lpnu\.ua/)).toBeInTheDocument();
    expect(within(row).getByText(/Очікує перевірки/)).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: 'Переглянути документ' })).toHaveAttribute('href', '/api/files/f1');
    expect(screen.getByRole('heading', { level: 1, name: 'Перевірка студентських документів' })).toBeInTheDocument();
  });

  it('US-39 sc.1 «Схвалити» sends the decision and the row leaves the queue', async () => {
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole('button', { name: 'Схвалити' }));

    expect(await screen.findByText('Студента підтверджено.')).toHaveAttribute('role', 'status');
    expect(calls).toEqual([{ url: '/api/mod/verifications/v1/approve', body: {} }]);
    expect(await screen.findByText('Документів на перевірку немає.')).toBeInTheDocument();
    expect(screen.queryByRole('article', { name: 'Олена Коваль' })).not.toBeInTheDocument();
  });

  it('US-39 sc.2 «Відхилити» without a reason shows REASON_REQUIRED and sends nothing; with a reason it is sent', async () => {
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole('button', { name: 'Відхилити' }));
    await user.click(screen.getByRole('button', { name: 'Підтвердити відхилення' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Вкажіть причину відхилення');
    expect(calls).toHaveLength(0);

    await user.type(screen.getByLabelText('Причина для студента'), 'Фото нечитабельне');
    await user.click(screen.getByRole('button', { name: 'Підтвердити відхилення' }));

    expect(await screen.findByText('Документ відхилено, студент отримає причину.')).toBeInTheDocument();
    expect(calls).toEqual([{ url: '/api/mod/verifications/v1/reject', body: { reason: 'Фото нечитабельне' } }]);
  });

  it('a decision someone else already made is shown by its code in an alert', async () => {
    const user = userEvent.setup();
    decisionResponse = () => apiError('ALREADY_DECIDED', 409);
    open();
    await user.click(await screen.findByRole('button', { name: 'Схвалити' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Рішення вже ухвалено');
  });
});
