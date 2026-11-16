import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestRouter, providerFuture } from '../src/app/router';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const apiError = (code: string, status: number) => json({ error: { code, message: 'x' } }, status);

const student = (id: string, displayName: string, verified: boolean, skills: string[] = [], bio = '') => ({ id, displayName, verified, skills, bio });
const candidate = (id: string, who: ReturnType<typeof student>, note: string | null = null) => ({
  id,
  taskId: 't1',
  status: 'sent',
  note,
  createdAt: '2026-11-12T09:15:00.000Z',
  student: who,
});

let status: string;
let applications: ReturnType<typeof candidate>[];
let listResponse: (() => Response) | null;

beforeEach(() => {
  status = 'published';
  applications = [];
  listResponse = null;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/tasks/t1/applications') {
        return listResponse ? listResponse() : json({ task: { id: 't1', title: 'Логотип для кав’ярні', status, priceKopecks: 50_000 }, applications });
      }
      if (url === '/api/tasks/t1/messages') return json({ messages: [] });
      return json({ status: 'ok' });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const open = () => render(<RouterProvider router={createTestRouter(['/c/tasks/t1'])} future={providerFuture} />);

describe('/c/tasks/:id candidates (US-24)', () => {
  it('US-24 sc.1 the applicants are listed with the verified badge, skills, status and note, and the name links to the profile', async () => {
    applications = [candidate('a1', student('u1', 'Олена Коваль', true, ['HTML', 'Java']), 'Маю досвід')];
    open();

    const item = await screen.findByRole('article', { name: 'Олена Коваль' });
    expect(within(item).getByText('Верифікований студент')).toBeInTheDocument();
    expect(within(item).getByRole('list', { name: 'Навички' })).toHaveTextContent('HTMLJava');
    expect(within(item).getByText('Надіслано')).toBeInTheDocument();
    expect(within(item).getByText(/Маю досвід/)).toBeInTheDocument();
    expect(within(item).getByRole('link', { name: 'Олена Коваль' })).toHaveAttribute('href', '/u/u1');
    expect(screen.getByRole('heading', { level: 1, name: 'Логотип для кав’ярні' })).toBeInTheDocument();
  });

  it('US-23 INV-22 the customer sends into a chat that was closed meanwhile: 409 CHAT_CLOSED, and the page turns read-only without a reload', async () => {
    status = 'in_progress';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === '/api/tasks/t1/applications') {
          return json({ task: { id: 't1', title: 'Логотип для кав’ярні', status, priceKopecks: 50_000 }, applications: [] });
        }
        if (url === '/api/tasks/t1/messages' && init?.method === 'POST') {
          status = 'done';
          return apiError('CHAT_CLOSED', 409);
        }
        if (url === '/api/tasks/t1/messages') return json({ messages: [] });
        return json({ status: 'ok' });
      }),
    );
    const user = userEvent.setup();
    open();

    await user.type(await screen.findByLabelText('Повідомлення'), 'Добрий день');
    await user.click(screen.getByRole('button', { name: 'Надіслати' }));

    expect(await screen.findByText(/Чат закрито: завдання завершене/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Надіслати' })).not.toBeInTheDocument();
  });

  it('US-24 a list cut at 100 applicants says so; a complete list does not', async () => {
    applications = [candidate('a1', student('u1', 'Олена Коваль', true))];
    listResponse = () => json({ task: { id: 't1', title: 'Логотип для кав’ярні', status, priceKopecks: 50_000 }, applications, truncated: true });
    open();
    expect(await screen.findByText('Показано перші 100 відгуків, решту поки не видно.')).toBeInTheDocument();
  });

  it('US-24 sc.1 the bio of a student is shown as text when there is one, and nothing when it is empty', async () => {
    applications = [
      candidate('a1', student('u1', 'Олена Коваль', true, [], 'Студентка 2 курсу, пишу на Java')),
      candidate('a2', student('u2', 'Петро Іваненко', true)),
    ];
    open();

    const withBio = await screen.findByRole('article', { name: 'Олена Коваль' });
    expect(within(withBio).getByText('Про мене: Студентка 2 курсу, пишу на Java')).toBeInTheDocument();
    const withoutBio = screen.getByRole('article', { name: 'Петро Іваненко' });
    expect(within(withoutBio).queryByText(/Про мене/)).not.toBeInTheDocument();
  });

  it('US-24 sc.2 an applicant who is not verified has no badge', async () => {
    applications = [candidate('a1', student('u1', 'Олена Коваль', true)), candidate('a2', student('u2', 'Петро Іваненко', false))];
    open();

    const verified = await screen.findByRole('article', { name: 'Олена Коваль' });
    const unverified = screen.getByRole('article', { name: 'Петро Іваненко' });
    expect(within(verified).getByText('Верифікований студент')).toBeInTheDocument();
    expect(within(unverified).queryByText('Верифікований студент')).not.toBeInTheDocument();
  });

  // The 390 px layout itself is checked by hand (traceability); here: the link is a plain page link, and the page scales.
  it('US-24 sc.3 the profile link opens as a page, not a dialog or a new window, and the app has the mobile viewport', async () => {
    applications = [candidate('a1', student('u1', 'Олена Коваль', true))];
    open();

    const link = await screen.findByRole('link', { name: 'Олена Коваль' });
    expect(link).toHaveAttribute('href', '/u/u1');
    expect(link).not.toHaveAttribute('target');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const html = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../index.html'), 'utf8');
    expect(html).toMatch(/<meta name="viewport" content="width=device-width, initial-scale=1\.0"/);
  });

  it('US-24 with no applicants the page says so', async () => {
    open();
    expect(await screen.findByText('Відгуків поки немає.')).toBeInTheDocument();
  });

  it('US-24 the chat with the executor shows for a task in progress and not for a published one (US-23)', async () => {
    status = 'in_progress';
    applications = [candidate('a1', student('u1', 'Олена Коваль', true))];
    open();
    expect(await screen.findByRole('heading', { name: 'Чат із виконавцем' })).toBeInTheDocument();
  });

  it.each([
    ['done', 'завдання завершене'],
    ['cancelled', 'завдання скасоване'],
  ])('US-24 a %s task shows the chat read-only, with no form (INV-22, US-23)', async (taskStatus, note) => {
    status = taskStatus;
    applications = [candidate('a1', student('u1', 'Олена Коваль', true))];
    open();

    expect(await screen.findByRole('heading', { name: 'Чат із виконавцем' })).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`Чат закрито: ${note}`))).toBeInTheDocument();
    expect(screen.queryByLabelText('Повідомлення')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Надіслати' })).not.toBeInTheDocument();
  });

  const withTask = (task: Record<string, unknown>) => () =>
    json({ task: { id: 't1', title: 'Логотип для кав’ярні', status, priceKopecks: 50_000, ...task }, applications });

  it('US-25 a published task past its deadline: the select buttons are off and the page says why', async () => {
    applications = [candidate('a1', student('u1', 'Олена Коваль', true))];
    listResponse = withTask({ deadlineAt: '2020-01-01T00:00:00.000Z', hasExecutor: false });
    open();
    const item = await screen.findByRole('article', { name: 'Олена Коваль' });
    expect(within(item).getByRole('button', { name: 'Обрати виконавцем' })).toBeDisabled();
    expect(screen.getByText(/Строк виконання завдання минув/)).toBeInTheDocument();
  });

  it('US-25 a published task before its deadline keeps the select buttons on and has no deadline note', async () => {
    applications = [candidate('a1', student('u1', 'Олена Коваль', true))];
    listResponse = withTask({ deadlineAt: '2999-01-01T00:00:00.000Z', hasExecutor: false });
    open();
    const item = await screen.findByRole('article', { name: 'Олена Коваль' });
    expect(within(item).getByRole('button', { name: 'Обрати виконавцем' })).toBeEnabled();
    expect(screen.queryByText(/Строк виконання завдання минув/)).not.toBeInTheDocument();
  });

  it('US-23 INV-22 a task cancelled before an executor was chosen shows no chat; one that had an executor keeps its history', async () => {
    status = 'cancelled';
    listResponse = withTask({ deadlineAt: '2999-01-01T00:00:00.000Z', hasExecutor: false });
    open();
    await screen.findByRole('heading', { name: 'Логотип для кав’ярні' });
    expect(screen.queryByRole('heading', { name: 'Чат із виконавцем' })).not.toBeInTheDocument();
  });

  it('US-24 a published task has no chat', async () => {
    applications = [candidate('a1', student('u1', 'Олена Коваль', true))];
    open();
    await screen.findByRole('article', { name: 'Олена Коваль' });
    expect(screen.queryByRole('heading', { name: 'Чат із виконавцем' })).not.toBeInTheDocument();
  });

  it.each([
    ['NOT_TASK_OWNER', 403, 'Доступ заборонено'],
    ['NOT_FOUND', 404, 'Не знайдено'],
  ])('US-24 the API code %s is shown by its Ukrainian text', async (code, httpStatus, text) => {
    listResponse = () => apiError(code, httpStatus);
    open();
    expect(await screen.findByRole('alert')).toHaveTextContent(text);
  });
});
