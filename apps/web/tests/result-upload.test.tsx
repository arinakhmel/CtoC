import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestRouter, providerFuture } from '../src/app/router';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const apiError = (code: string, status: number) => json({ error: { code, message: 'x' } }, status);

const work = {
  id: 't1',
  title: 'Логотип для кав’ярні',
  description: 'Потрібен логотип у двох кольорах.',
  priceKopecks: 50_000,
  commissionKopecks: 5_000,
  netKopecks: 45_000,
  deadlineAt: '2030-05-20T15:30:00.000Z',
  publishedAt: '2026-11-10T10:00:00.000Z',
  status: 'in_progress',
  assignedAt: '2026-11-11T10:00:00.000Z',
};
const savedFile = { id: 'f1', name: 'logo.pdf', mime: 'application/pdf', sizeBytes: 2048, createdAt: '2026-11-12T10:00:00.000Z' };
const resultWith = (files: unknown[]) => ({ result: { version: 1, status: 'draft', revisionComment: null, submittedAt: null, files } });

let taskStatus: string;
let current: { result: unknown };
let uploadAnswer: () => Response;
let uploads: FormData[];

beforeEach(() => {
  taskStatus = 'in_progress';
  current = { result: null };
  uploads = [];
  uploadAnswer = () => json(resultWith([savedFile]), 201);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/tasks/t1') return json({ task: { ...work, status: taskStatus } });
      if (url === '/api/tasks/t1/messages') return json({ messages: [] });
      if (url === '/api/tasks/t1/result/files' && init?.method === 'POST') {
        uploads.push(init.body as FormData);
        return uploadAnswer();
      }
      if (url === '/api/tasks/t1/result') return json(current);
      return json({ status: 'ok' });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const openCard = () => render(<RouterProvider router={createTestRouter(['/work/t1'])} future={providerFuture} />);
const fileInput = async () => screen.findByLabelText('Файл результату (до 50 МБ)');
const save = () => userEvent.click(screen.getByRole('button', { name: 'Зберегти результат' }));
const pick = async (file: File) => userEvent.upload(await fileInput(), file, { applyAccept: false });

describe('/work/:taskId result upload (US-27)', () => {
  it('US-27 sc.1 the card has an upload zone; a chosen file is sent as the field `file` and appears in the list', async () => {
    openCard();
    expect(await screen.findByRole('form', { name: 'Завантаження результату' })).toBeInTheDocument();
    expect(await screen.findByText('Файлів результату ще немає.')).toBeInTheDocument();

    await pick(new File(['%PDF-1.4'], 'logo.pdf', { type: 'application/pdf' }));
    await save();

    const list = await screen.findByRole('list', { name: 'Завантажені файли' });
    expect(list).toHaveTextContent('logo.pdf');
    expect(screen.getByRole('link', { name: 'logo.pdf' })).toHaveAttribute('href', '/api/files/f1');
    expect(uploads).toHaveLength(1);
    expect((uploads[0]!.get('file') as File).name).toBe('logo.pdf');
    expect(screen.queryByText('Файлів результату ще немає.')).not.toBeInTheDocument();
  });

  it('US-27 sc.1 files already saved are listed when the card opens', async () => {
    current = resultWith([savedFile]);
    openCard();

    expect(await screen.findByRole('link', { name: 'logo.pdf' })).toBeInTheDocument();
  });

  it('US-27 sc.1 saving without a file asks to choose one and sends nothing', async () => {
    openCard();
    await fileInput();

    await save();

    expect(await screen.findByRole('alert')).toHaveTextContent('Оберіть файл результату');
    expect(uploads).toHaveLength(0);
  });

  it.each(['run.bat', 'screen.scr'])('US-27 sc.2 a %s file is refused in the form with the security text, and is not sent', async (name) => {
    openCard();

    await pick(new File(['x'], name, { type: 'application/octet-stream' }));
    await save();

    expect(await screen.findByText('Цей тип файлу заборонено з міркувань безпеки')).toBeInTheDocument();
    expect(uploads).toHaveLength(0);
  });

  it('US-27 sc.2 when the server finds an executable behind a harmless name it answers 400 and the form shows the same text', async () => {
    uploadAnswer = () => apiError('FILE_TYPE_NOT_ALLOWED', 400);
    openCard();

    await pick(new File(['MZ'], 'report.pdf', { type: 'application/pdf' }));
    await save();

    expect(await screen.findByText('Цей тип файлу заборонено з міркувань безпеки')).toBeInTheDocument();
    expect(uploads).toHaveLength(1);
  });

  it('US-27 sc.3 a file over 50 MB gets the size warning in the form, and is not sent', async () => {
    openCard();
    const big = new File(['x'], 'big.pdf', { type: 'application/pdf' });
    Object.defineProperty(big, 'size', { value: 50 * 1024 * 1024 + 1 });

    await pick(big);
    await save();

    expect(await screen.findByText('Файл занадто великий. Максимальний розмір — 50 МБ')).toBeInTheDocument();
    expect(uploads).toHaveLength(0);
  });

  it('US-27 sc.3 when the server refuses the size (413-like 400) the form shows the 50 MB text', async () => {
    uploadAnswer = () => apiError('FILE_TOO_LARGE', 400);
    openCard();

    await pick(new File(['x'], 'big.pdf', { type: 'application/pdf' }));
    await save();

    expect(await screen.findByText('Файл занадто великий. Максимальний розмір — 50 МБ')).toBeInTheDocument();
  });

  it('a refusal from the server for other reasons shows its Ukrainian text (too many files, locked)', async () => {
    uploadAnswer = () => apiError('TOO_MANY_FILES', 400);
    openCard();

    await pick(new File(['x'], 'a.pdf', { type: 'application/pdf' }));
    await save();

    expect(await screen.findByText('Забагато файлів у результаті')).toBeInTheDocument();
  });

  it('a task in review has no upload form: the files are locked (US-29 builds the rest)', async () => {
    taskStatus = 'in_review';
    current = resultWith([savedFile]);
    openCard();

    expect(await screen.findByRole('link', { name: 'logo.pdf' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('form', { name: 'Завантаження результату' })).not.toBeInTheDocument());
  });
});
