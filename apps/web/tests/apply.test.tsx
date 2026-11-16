import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestRouter, providerFuture } from '../src/app/router';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const apiError = (code: string, status: number) => json({ error: { code, message: 'x' } }, status);

const task = {
  id: 't1',
  title: 'Завдання 1',
  description: 'Опис завдання 1',
  priceKopecks: 50_000,
  deadlineAt: '2030-05-20T15:30:00.000Z',
  publishedAt: '2026-11-10T10:00:00.000Z',
};
const application = { id: 'a1', taskId: 't1', status: 'sent', note: null, createdAt: '2026-11-12T09:15:00.000Z' };

let applyResponse: () => Response;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  applyResponse = () => json({ application }, 201);
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/tasks/t1' && (!init?.method || init.method === 'GET')) return json({ task });
    if (url === '/api/tasks/t1/applications' && init?.method === 'POST') return applyResponse();
    return json({ status: 'ok' });
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

async function openTask() {
  render(<RouterProvider router={createTestRouter(['/tasks/t1'])} future={providerFuture} />);
  return screen.findByRole('button', { name: 'Відгукнутися' });
}

describe('«Відгукнутися» on /tasks/:id (US-18)', () => {
  it('US-18 sc.1 one press sends the application with no price and confirms it', async () => {
    const user = userEvent.setup();
    const button = await openTask();

    await user.click(button);

    expect(await screen.findByText('Відгук надіслано')).toHaveAttribute('role', 'status');
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(post?.[0]).toBe('/api/tasks/t1/applications');
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({}); // no price, status or student in the request
  });

  it('US-18 sc.2 after applying the button is disabled and cannot send a second application', async () => {
    const user = userEvent.setup();
    const button = await openTask();

    await user.click(button);

    expect(await screen.findByRole('button', { name: 'Відгукнутися' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Відгукнутися' }));
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
  });

  it('US-18 sc.2 a 409 ALREADY_APPLIED shows «Ви вже подали відгук на це завдання» and disables the button', async () => {
    applyResponse = () => apiError('ALREADY_APPLIED', 409);
    const user = userEvent.setup();
    const button = await openTask();

    await user.click(button);

    expect(await screen.findByText('Ви вже подали відгук на це завдання')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Відгукнутися' })).toBeDisabled();
  });

  // W-02, decided: the unverified student sees the button, presses it, and is invited to verify.
  it('US-18 sc.3 an unverified student sees the button, gets the block message and a link to verification', async () => {
    applyResponse = () => apiError('STUDENT_NOT_VERIFIED', 403);
    const user = userEvent.setup();
    const button = await openTask();
    expect(button).toBeEnabled();

    await user.click(button);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Завершіть верифікацію статусу студента');
    expect(screen.getByRole('link', { name: 'Пройти верифікацію' })).toHaveAttribute('href', '/me/verification');
  });

  it('US-18 a task that is no longer open shows its message and the button stays usable', async () => {
    applyResponse = () => apiError('TASK_NOT_OPEN', 409);
    const user = userEvent.setup();
    const button = await openTask();

    await user.click(button);

    expect(await screen.findByRole('alert')).toHaveTextContent('Завдання вже недоступне для відгуків');
  });
});
