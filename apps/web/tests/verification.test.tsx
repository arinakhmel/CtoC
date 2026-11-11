import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestRouter, providerFuture } from '../src/app/router';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const apiError = (code: string, status: number) => json({ error: { code, message: 'x' } }, status);
const pendingBody = { verification: { id: 'v1', status: 'pending', label: 'Очікує перевірки', reason: null, createdAt: '2026-11-10T10:00:00.000Z', decidedAt: null } };

let getResponse: () => Response;
let postResponse: () => Response;
let posts: Array<{ body: unknown; headers: Record<string, string> }>;

beforeEach(() => {
  posts = [];
  getResponse = () => json({ verification: null });
  postResponse = () => json(pendingBody, 201);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/me/verification' && init?.method === 'POST') {
        posts.push({ body: init.body, headers: (init.headers ?? {}) as Record<string, string> });
        return postResponse();
      }
      if (url === '/api/me/verification') return getResponse();
      return json({ status: 'ok' });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const open = () => render(<RouterProvider router={createTestRouter(['/me/verification'])} future={providerFuture} />);
const fileOf = (name: string, type: string, size = 200) => new File([new Uint8Array(size)], name, { type });

/** The file picker filters by `accept` in real browsers; these tests choose the file directly. */
const choose = async (file: File) => {
  const user = userEvent.setup({ applyAccept: false });
  open();
  await user.upload(await screen.findByLabelText(/Студентський квиток/), file);
  await user.click(screen.getByRole('button', { name: 'Надіслати на перевірку' }));
  return user;
};

describe('/me/verification page (US-08)', () => {
  it.each([
    ['a JPG', fileOf('ticket.jpg', 'image/jpeg')],
    ['a PNG', fileOf('ticket.png', 'image/png')],
    ['a PDF', fileOf('certificate.pdf', 'application/pdf')],
  ])('US-08 sc.1 %s is sent as multipart and the status «Очікує перевірки» is shown', async (_name, file) => {
    await choose(file);

    expect(await screen.findByText('Очікує перевірки')).toBeInTheDocument();
    expect(posts).toHaveLength(1);
    const body = posts[0]!.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect((body.get('file') as File).name).toBe(file.name);
    expect(Object.keys(posts[0]!.headers).map((h) => h.toLowerCase())).not.toContain('content-type'); // the browser adds the boundary
    expect(screen.queryByRole('button', { name: 'Надіслати на перевірку' })).toBeNull();
  });

  it('US-08 sc.1 an existing pending request is shown on load and the upload form is hidden', async () => {
    getResponse = () => json(pendingBody);
    open();

    expect(await screen.findByText('Очікує перевірки')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Студентський квиток/)).toBeNull();
  });

  it('US-08 sc.1 a rejected request shows its reason and allows a new upload', async () => {
    getResponse = () => json({ verification: { ...pendingBody.verification, status: 'rejected', label: 'Відхилено', reason: 'Документ нечитабельний' } });
    open();

    expect(await screen.findByText('Відхилено')).toBeInTheDocument();
    expect(screen.getByText(/Документ нечитабельний/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Студентський квиток/)).toBeInTheDocument();
  });

  it.each([
    ['VERIFICATION_PENDING', 409, 'Ваш документ уже очікує перевірки'],
    ['ALREADY_VERIFIED', 409, 'Статус студента вже підтверджено'],
    ['EMAIL_NOT_CONFIRMED', 403, 'Спершу підтвердіть пошту'],
  ])('US-08 sc.1 the API code %s is shown by its Ukrainian text', async (code, status, text) => {
    postResponse = () => apiError(code, status);

    await choose(fileOf('ticket.jpg', 'image/jpeg'));

    expect(await screen.findByText(text)).toBeInTheDocument();
  });

  it('US-08 sc.1 without a session the page shows the login prompt', async () => {
    getResponse = () => apiError('AUTH_REQUIRED', 401);
    open();

    expect(await screen.findByText('Увійдіть, щоб продовжити', { exact: false })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Увійти' })).toHaveAttribute('href', '/login');
  });

  it.each([
    ['an .exe', fileOf('virus.exe', 'application/x-msdownload')],
    ['a .zip', fileOf('archive.zip', 'application/zip')],
  ])('US-08 sc.2 %s is rejected in the form with the format message and not sent', async (_name, file) => {
    await choose(file);

    expect(await screen.findByText('Дозволено лише зображення або PDF')).toBeInTheDocument();
    expect(posts).toHaveLength(0);
  });

  it('US-08 sc.2 the API code FILE_TYPE_NOT_ALLOWED (type found from the content) is shown', async () => {
    postResponse = () => apiError('FILE_TYPE_NOT_ALLOWED', 400);

    await choose(fileOf('renamed.jpg', 'image/jpeg'));

    expect(await screen.findByText('Дозволено лише зображення або PDF')).toBeInTheDocument();
  });

  it('US-08 sc.3 a file over 10 MB is rejected in the form with the size message and not sent', async () => {
    await choose(fileOf('huge.jpg', 'image/jpeg', 10 * 1024 * 1024 + 1));

    expect(await screen.findByText('Файл занадто великий. Максимальний розмір — 10 МБ')).toBeInTheDocument();
    expect(posts).toHaveLength(0);
  });

  it('US-08 sc.3 the API code FILE_TOO_LARGE is shown', async () => {
    postResponse = () => apiError('FILE_TOO_LARGE', 400);

    await choose(fileOf('ticket.jpg', 'image/jpeg'));

    expect(await screen.findByText('Файл занадто великий. Максимальний розмір — 10 МБ')).toBeInTheDocument();
  });

  it('US-08 sc.1 submitting without choosing a file shows a validation message and sends nothing', async () => {
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole('button', { name: 'Надіслати на перевірку' }));

    expect(await screen.findByText('Перевірте правильність заповнення полів')).toBeInTheDocument();
    expect(posts).toHaveLength(0);
  });
});
