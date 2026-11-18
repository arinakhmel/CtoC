import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestRouter, providerFuture } from '../src/app/router';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

const work = {
  id: 't1',
  title: 'Логотип для кав’ярні',
  description: 'Потрібен логотип у двох кольорах.',
  priceKopecks: 50_000,
  commissionKopecks: 5_000,
  netKopecks: 45_000,
  deadlineAt: '2030-05-20T15:30:00.000Z',
  publishedAt: '2026-11-10T10:00:00.000Z',
  status: 'revision',
  assignedAt: '2026-11-11T10:00:00.000Z',
};
const file = (id: string, name: string) => ({ id, name, mime: 'application/pdf', sizeBytes: 2048, createdAt: '2026-11-12T10:00:00.000Z' });
const COMMENT = 'Додайте висновки.\nВиправте шапку документа.';
const lastReturn = { version: 1, comment: COMMENT, returnedAt: '2026-11-14T10:00:00.000Z' };
const result = (version: number, status: string, files: unknown[], last: typeof lastReturn | null = lastReturn) => ({
  result: { version, status, revisionComment: status === 'returned' ? COMMENT : null, submittedAt: null, lastReturn: last, files },
});

let taskStatus: string;
let current: { result: unknown };
let submits: number;

beforeEach(() => {
  taskStatus = 'revision';
  current = result(1, 'returned', [file('f1', 'v1.pdf')]);
  submits = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/tasks/t1') return json({ task: { ...work, status: taskStatus } });
      if (url === '/api/tasks/t1/messages') return json({ messages: [] });
      if (url === '/api/tasks/t1/result/files' && init?.method === 'POST') {
        current = result(2, 'draft', [file('f2', 'v2.pdf')]); // the first upload after the return opens version 2; the comment stays as lastReturn
        return json(current, 201);
      }
      if (url === '/api/tasks/t1/result/submit' && init?.method === 'POST') {
        submits += 1;
        taskStatus = 'in_review';
        current = result(2, 'submitted', [file('f2', 'v2.pdf')], null); // in review the comment is history: lastReturn is null
        return json({ task: { id: 't1', status: 'in_review' }, ...current });
      }
      if (url === '/api/tasks/t1/result') return json(current);
      return json({ status: 'ok' });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const openCard = () => render(<RouterProvider router={createTestRouter(['/work/t1'])} future={providerFuture} />);
const sendButton = () => screen.findByRole('button', { name: 'Надіслати на перевірку' });
const uploadNewFile = async () => {
  await userEvent.upload(await screen.findByLabelText('Файл результату (до 50 МБ)'), new File(['%PDF-1.4'], 'v2.pdf', { type: 'application/pdf' }), { applyAccept: false });
  await userEvent.click(screen.getByRole('button', { name: 'Зберегти результат' }));
};

describe('/work/:taskId after the customer sent the result back (US-33 sc.1)', () => {
  it('US-33 sc.1 the student sees «Замовник повернув результат на доопрацювання» and the comment, with its line break', async () => {
    openCard();

    expect(await screen.findByRole('heading', { name: 'Замовник повернув результат на доопрацювання' })).toBeInTheDocument();
    const text = screen.getByText(/Додайте висновки\./);
    expect(text.textContent).toBe(COMMENT); // the text as the customer wrote it, with its line break
    expect(text).toHaveStyle({ whiteSpace: 'pre-wrap' }); // so the line break is shown
    expect(await screen.findByText('На доопрацюванні')).toBeInTheDocument();
  });

  it('US-32 sc.1 the student may upload the new version: the form is there, and the files of the returned version have no «Видалити»', async () => {
    openCard();

    expect(await screen.findByRole('form', { name: 'Завантаження результату' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'v1.pdf' })).toBeInTheDocument();
    expect(screen.queryAllByRole('button', { name: /Видалити/ })).toHaveLength(0); // INV-16: the returned version is fixed
  });

  it('«Надіслати на перевірку» is off before the new version is uploaded, and the hint says what to do', async () => {
    openCard();

    const button = await sendButton();
    expect(button).toBeDisabled();
    expect(await screen.findByText(/Завантажте нову версію результату, щоб надіслати її знову/)).toBeInTheDocument();
    expect(button).toHaveAccessibleDescription(/Завантажте нову версію/);
    await userEvent.click(button);
    expect(submits).toBe(0); // no request, so no 409 NO_RESULT_FILES for the student
  });

  it('after the new file is saved the button is on, the comment is still shown, and the hint is gone', async () => {
    openCard();
    await uploadNewFile();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Надіслати на перевірку' })).toBeEnabled());
    expect(screen.getByRole('heading', { name: 'Замовник повернув результат на доопрацювання' })).toBeInTheDocument();
    expect(screen.getByText(/Додайте висновки\./)).toBeInTheDocument();
    expect(screen.queryByText(/Завантажте нову версію результату/)).not.toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'v2.pdf' })).toBeInTheDocument();
  });

  it('US-48 sc.3 the new version is sent: «На перевірці», the lock note, the success message, and the old comment is gone', async () => {
    openCard();
    await uploadNewFile();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Надіслати на перевірку' })).toBeEnabled());

    await userEvent.click(screen.getByRole('button', { name: 'Надіслати на перевірку' }));

    expect(await screen.findByText('Результат надіслано на перевірку. Замовник отримав сповіщення.')).toBeInTheDocument();
    expect(submits).toBe(1);
    expect(await screen.findByText('На перевірці')).toBeInTheDocument();
    expect(screen.getByText('Результат на перевірці, редагування заблоковано до рішення замовника.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Замовник повернув результат на доопрацювання' })).not.toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Надіслати на перевірку' })).not.toBeInTheDocument();
  });

  it('a draft with no file in revision is off with the ordinary hint (save at least one file)', async () => {
    current = result(2, 'draft', []);
    openCard();

    expect(await sendButton()).toBeDisabled();
    expect(await screen.findByText('Щоб надіслати результат, спочатку збережіть хоча б один файл.')).toBeInTheDocument();
    expect(screen.queryByText(/Завантажте нову версію/)).not.toBeInTheDocument();
  });

  it('while the result is still loading no hint is shown, so the «new version» hint does not flash in revision', async () => {
    let release: (response: Response) => void = () => undefined;
    const original = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => (url === '/api/tasks/t1/result' ? new Promise<Response>((resolve) => { release = resolve; }) : (original as typeof fetch)(url, init))));
    openCard();

    expect(await sendButton()).toBeDisabled();
    expect(screen.queryByText(/Завантажте нову версію/)).not.toBeInTheDocument();
    expect(screen.queryByText(/спочатку збережіть хоча б один файл/)).not.toBeInTheDocument();

    release(json(current));
    expect(await screen.findByText(/Завантажте нову версію результату/)).toBeInTheDocument();
  });

  it('a task in progress with a draft and a file still has the button on (the rule did not break the first send)', async () => {
    taskStatus = 'in_progress';
    current = result(1, 'draft', [file('f1', 'first.pdf')], null);
    openCard();

    const button = await sendButton();
    await waitFor(() => expect(button).toBeEnabled()); // enabled once the draft with its file is loaded
    expect(screen.queryByRole('heading', { name: 'Замовник повернув результат на доопрацювання' })).not.toBeInTheDocument();
  });

  it('the comment is shown only while the task is in revision: in review it is not', async () => {
    taskStatus = 'in_review';
    current = result(2, 'submitted', [file('f2', 'v2.pdf')], lastReturn); // even if an answer carried it, the card shows it only in revision
    openCard();

    expect(await screen.findByText('На перевірці')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Замовник повернув результат на доопрацювання' })).not.toBeInTheDocument();
  });
});
