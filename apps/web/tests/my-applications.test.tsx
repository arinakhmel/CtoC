import { render, screen, within } from '@testing-library/react';
import { RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestRouter, providerFuture } from '../src/app/router';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const apiError = (code: string, status: number) => json({ error: { code, message: 'x' } }, status);

const row = (status: string, title = 'Логотип для кав’ярні') => ({
  id: `a-${status}`,
  taskId: 't1',
  status,
  note: null,
  createdAt: '2026-11-12T09:15:00.000Z',
  task: { id: 't1', title, priceKopecks: 50_000 },
});

let listResponse: () => Response;

beforeEach(() => {
  listResponse = () => json({ applications: [row('sent')] });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => (url === '/api/me/applications' ? listResponse() : json({ status: 'ok' }))),
  );
});
afterEach(() => vi.unstubAllGlobals());

const open = () => render(<RouterProvider router={createTestRouter(['/me/applications'])} future={providerFuture} />);

describe('/me/applications «Мої відгуки» (US-20)', () => {
  it('US-20 sc.1 a new application shows the status «Надіслано» and a link to the task', async () => {
    open();

    const item = await screen.findByRole('article', { name: 'Логотип для кав’ярні' });
    expect(within(item).getByText('Надіслано')).toBeInTheDocument();
    expect(within(item).getByRole('link', { name: 'Логотип для кав’ярні' })).toHaveAttribute('href', '/tasks/t1');
  });

  it('US-20 sc.2 an accepted application shows the status «Прийнято»', async () => {
    listResponse = () => json({ applications: [row('accepted')] });
    open();

    const item = await screen.findByRole('article', { name: 'Логотип для кав’ярні' });
    expect(within(item).getByText('Прийнято')).toBeInTheDocument();
    expect(screen.queryByText('Надіслано')).not.toBeInTheDocument();
  });

  it('US-20 sc.3 a rejected application shows the status «Відхилено»', async () => {
    listResponse = () => json({ applications: [row('rejected')] });
    open();

    const item = await screen.findByRole('article', { name: 'Логотип для кав’ярні' });
    expect(within(item).getByText('Відхилено')).toBeInTheDocument();
  });

  it('US-20 an accepted application links to the executor card /work/:taskId; a rejected one has no link (the feed page would be a 404)', async () => {
    listResponse = () => json({ applications: [row('accepted', 'Прийнято завдання'), row('rejected', 'Відхилене завдання'), row('sent', 'Нове завдання')] });
    open();

    expect(await screen.findByRole('link', { name: 'Прийнято завдання' })).toHaveAttribute('href', '/work/t1');
    expect(screen.getByRole('link', { name: 'Нове завдання' })).toHaveAttribute('href', '/tasks/t1');
    expect(screen.queryByRole('link', { name: 'Відхилене завдання' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Відхилене завдання' })).toBeInTheDocument();
  });

  it('US-20 with no applications the page says so and links to the feed', async () => {
    listResponse = () => json({ applications: [] });
    open();

    expect(await screen.findByText(/Ви ще не подавали відгуків/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Знайти завдання' })).toHaveAttribute('href', '/feed');
  });

  it('US-20 EMAIL_NOT_CONFIRMED shows its message and a link to confirm the email', async () => {
    listResponse = () => apiError('EMAIL_NOT_CONFIRMED', 403);
    open();

    expect(await screen.findByRole('alert')).toHaveTextContent('Спершу підтвердіть пошту');
    expect(screen.getByRole('link', { name: 'Підтвердити пошту' })).toHaveAttribute('href', '/confirm-email');
  });
});
