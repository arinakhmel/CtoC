import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestRouter, providerFuture } from '../src/app/router';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const apiError = (code: string, status: number) => json({ error: { code, message: 'x' } }, status);

const task = (id: string, title: string, status: string, applicationsCount = 0) => ({
  id,
  title,
  status,
  priceKopecks: 50_000,
  deadlineAt: '2030-05-20T12:30:00.000Z',
  applicationsCount,
});

let tasks: ReturnType<typeof task>[];
let listResponse: (() => Response) | null;
let deleteResponse: (() => Response) | null;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  tasks = [];
  listResponse = null;
  deleteResponse = null;
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/my/tasks') return listResponse ? listResponse() : json({ tasks });
    const del = /^\/api\/tasks\/([^/]+)$/.exec(url);
    if (del && init?.method === 'DELETE') {
      if (deleteResponse) return deleteResponse();
      tasks = tasks.filter((t) => t.id !== del[1]);
      return new Response(null, { status: 204 });
    }
    if (url === '/api/me') return json({ user: { id: 'c1', role: 'customer', displayName: 'Замовник', emailConfirmed: true, studentVerified: false } });
    return json({ status: 'ok' });
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const open = () => render(<RouterProvider router={createTestRouter(['/c/tasks'])} future={providerFuture} />);
const deletes = () => fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE');

describe('/c/tasks «Мої завдання» (US-50)', () => {
  it('US-50 sc.1 three tasks are listed with their status, price and deadline, and the number of applications only beside the published one', async () => {
    tasks = [task('t3', 'Банер', 'done'), task('t2', 'Парсер сайту', 'published', 2), task('t1', 'Логотип', 'pending_moderation')];
    open();

    expect(await screen.findByRole('heading', { level: 1, name: 'Мої завдання' })).toBeInTheDocument();
    const done = await screen.findByRole('article', { name: 'Банер' });
    const published = screen.getByRole('article', { name: 'Парсер сайту' });
    const pending = screen.getByRole('article', { name: 'Логотип' });
    expect(within(done).getByText('Виконано')).toBeInTheDocument();
    expect(within(published).getByText('Опубліковано')).toBeInTheDocument();
    expect(within(pending).getByText('На модерації')).toBeInTheDocument();
    expect(within(published).getByText('Відгуків: 2')).toBeInTheDocument();
    expect(within(pending).queryByText(/Відгуків/)).toBeNull();
    expect(within(done).queryByText(/Відгуків/)).toBeNull();
    expect(within(published).getByText(/500/)).toBeInTheDocument(); // the fixed price
    expect(published.querySelector('time')).toHaveAttribute('dateTime', '2030-05-20T12:30:00.000Z'); // the deadline
  });

  it.each([
    ['pending_moderation', 'На модерації'],
    ['published', 'Опубліковано'],
    ['rejected', 'Відхилено'],
    ['in_progress', 'В роботі'],
    ['in_review', 'На перевірці'],
    ['revision', 'На доопрацюванні'],
    ['done', 'Виконано'],
    ['cancelled', 'Скасовано'],
  ])('US-50 checklist the status %s is shown as «%s»', async (status, label) => {
    tasks = [task('t1', 'Завдання', status)];
    open();

    const article = await screen.findByRole('article', { name: 'Завдання' });
    expect(within(article).getByText(label)).toBeInTheDocument();
  });

  it('US-50 checklist every task has a way to manage it: a link to its page', async () => {
    tasks = [task('t2', 'Парсер сайту', 'published', 1), task('t1', 'Банер', 'done')];
    open();

    const published = await screen.findByRole('article', { name: 'Парсер сайту' });
    expect(within(published).getByRole('link', { name: 'Керувати' })).toHaveAttribute('href', '/c/tasks/t2');
    expect(within(screen.getByRole('article', { name: 'Банер' })).getByRole('link', { name: 'Керувати' })).toHaveAttribute('href', '/c/tasks/t1');
  });

  it('US-50 checklist with no tasks the page says so and offers «Створити завдання»', async () => {
    open();

    expect(await screen.findByText(/У вас ще немає завдань/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Створити завдання' })).toHaveAttribute('href', '/c/tasks/new');
    expect(screen.queryByRole('list', { name: 'Список завдань' })).toBeNull();
  });

  it('US-50 sc.2 the list shows what the API answers, so a task of another customer, which the API never sends, is not on the page', async () => {
    tasks = [task('t1', 'Моя задача', 'published')];
    open();

    expect(await screen.findByRole('article', { name: 'Моя задача' })).toBeInTheDocument();
    expect(screen.queryByText('Чужа задача')).toBeNull();
    expect(screen.getAllByRole('article', { name: /задача/ })).toHaveLength(1);
  });

  it('US-50 a failed load shows the error message', async () => {
    listResponse = () => apiError('INTERNAL_ERROR', 500);
    open();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('US-50 sc.3 a published task can be deleted after a confirmation, and it leaves the list', async () => {
    const user = userEvent.setup();
    tasks = [task('t2', 'Парсер сайту', 'published', 2), task('t1', 'Логотип', 'pending_moderation')];
    open();

    const article = await screen.findByRole('article', { name: 'Парсер сайту' });
    await user.click(within(article).getByRole('button', { name: 'Видалити' }));
    expect(deletes()).toHaveLength(0); // nothing is sent before the confirmation
    await user.click(within(article).getByRole('button', { name: 'Підтвердити видалення' }));

    await waitFor(() => expect(screen.queryByRole('article', { name: 'Парсер сайту' })).toBeNull());
    expect(deletes()).toHaveLength(1);
    expect(deletes()[0]![0]).toBe('/api/tasks/t2');
    expect(screen.getByRole('article', { name: 'Логотип' })).toBeInTheDocument();
  });

  it('US-50 sc.3 «Не видаляти» cancels the confirmation and sends nothing', async () => {
    const user = userEvent.setup();
    tasks = [task('t2', 'Парсер сайту', 'published')];
    open();

    const article = await screen.findByRole('article', { name: 'Парсер сайту' });
    await user.click(within(article).getByRole('button', { name: 'Видалити' }));
    await user.click(within(article).getByRole('button', { name: 'Не видаляти' }));

    expect(within(article).getByRole('button', { name: 'Видалити' })).toBeInTheDocument();
    expect(deletes()).toHaveLength(0);
  });

  it('US-50 sc.3 a task with an executor or a decided one has no delete button', async () => {
    tasks = [task('t1', 'В роботі', 'in_progress'), task('t2', 'Готово', 'done'), task('t3', 'Відхилене', 'rejected'), task('t4', 'Скасоване', 'cancelled')];
    open();

    await screen.findByRole('article', { name: 'В роботі' });
    expect(screen.queryByRole('button', { name: 'Видалити' })).toBeNull();
  });

  it('US-50 sc.3 when the executor was chosen meanwhile the API says 409 TASK_HAS_EXECUTOR: the message is shown and the list is asked again', async () => {
    const user = userEvent.setup();
    tasks = [task('t2', 'Парсер сайту', 'published', 1)];
    deleteResponse = () => {
      tasks = [task('t2', 'Парсер сайту', 'in_progress')];
      return apiError('TASK_HAS_EXECUTOR', 409);
    };
    open();

    const article = await screen.findByRole('article', { name: 'Парсер сайту' });
    await user.click(within(article).getByRole('button', { name: 'Видалити' }));
    await user.click(within(article).getByRole('button', { name: 'Підтвердити видалення' }));

    expect(await screen.findByText('Завдання з виконавцем не можна видалити')).toBeInTheDocument();
    await waitFor(() => expect(within(screen.getByRole('article', { name: 'Парсер сайту' })).getByText('В роботі')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Видалити' })).toBeNull();
  });
});
