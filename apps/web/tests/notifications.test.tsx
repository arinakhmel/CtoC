import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestRouter, providerFuture } from '../src/app/router';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const apiError = (code: string, status: number) => json({ error: { code, message: 'x' } }, status);

const TEXT = 'Вас обрано виконавцем завдання Парсер сайту';
const note = (read: boolean) => ({
  id: 'n1',
  type: 'executor_selected',
  text: TEXT,
  payload: { taskId: 't1', taskTitle: 'Парсер сайту' },
  read,
  createdAt: '2026-11-12T09:15:00.000Z',
});

let state: { read: boolean };
let listResponse: (() => Response) | null;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  state = { read: false };
  listResponse = null;
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/me/notifications') return listResponse ? listResponse() : json({ notifications: [note(state.read)] });
    if (url === '/api/me/notifications/n1/read' && init?.method === 'POST') {
      state.read = true;
      return new Response(null, { status: 204 });
    }
    return json({ status: 'ok' });
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const open = () => render(<RouterProvider router={createTestRouter(['/notifications'])} future={providerFuture} />);

describe('/notifications of the student: «Замовник повернув результат…» (US-33)', () => {
  const TEXT_RETURNED = 'Замовник повернув результат на доопрацювання за завданням «Парсер сайту»';

  it('US-33 the notification is listed as new with its text and links to the executor card, where the comment is; a payload of another shape gives no link', async () => {
    listResponse = () =>
      json({
        notifications: [
          { id: 'n5', type: 'result_returned', text: TEXT_RETURNED, payload: { taskId: 't5', taskTitle: 'Парсер сайту' }, read: false, createdAt: '2026-11-13T10:00:00.000Z' },
          { ...note(true), id: 'n4', type: 'result_returned', text: 'Нове сповіщення', payload: { unexpected: true } },
        ],
      });
    open();

    const article = await screen.findByRole('article', { name: TEXT_RETURNED });
    expect(within(article).getByText('Нове:')).toBeInTheDocument();
    expect(within(article).getByRole('link', { name: 'Відкрити завдання' })).toHaveAttribute('href', '/work/t5');
    expect(screen.getAllByRole('link', { name: 'Відкрити завдання' })).toHaveLength(1); // the bad payload has no link
  });
});

describe('/notifications of the student: «Ваш результат прийнято…» (US-30)', () => {
  const TEXT_ACCEPTED = 'Ваш результат прийнято замовником! Оплату нараховано';

  it('US-30 sc.3 the notification is listed as new, with the exact text, and links to the executor card of the task; a payload of another shape gives no link', async () => {
    listResponse = () =>
      json({
        notifications: [
          { id: 'n7', type: 'result_accepted', text: TEXT_ACCEPTED, payload: { taskId: 't7', taskTitle: 'Парсер сайту' }, read: false, createdAt: '2026-11-13T10:00:00.000Z' },
          { ...note(true), id: 'n6', type: 'result_accepted', text: 'Нове сповіщення', payload: { unexpected: true } },
        ],
      });
    open();

    const article = await screen.findByRole('article', { name: TEXT_ACCEPTED });
    expect(within(article).getByText('Нове:')).toBeInTheDocument();
    expect(within(article).getByRole('link', { name: 'Відкрити завдання' })).toHaveAttribute('href', '/work/t7');
    expect(screen.getAllByRole('link', { name: 'Відкрити завдання' })).toHaveLength(1); // the bad payload has no link
  });

  it('US-30 sc.3 once marked as read it stays in the list without «Нове:»', async () => {
    const accepted = (read: boolean) => ({ id: 'n1', type: 'result_accepted', text: TEXT_ACCEPTED, payload: { taskId: 't1', taskTitle: 'Парсер сайту' }, read, createdAt: '2026-11-13T10:00:00.000Z' });
    listResponse = () => json({ notifications: [accepted(state.read)] });
    open();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Позначити прочитаним' }));

    const article = await screen.findByRole('article', { name: TEXT_ACCEPTED });
    await waitFor(() => expect(within(article).queryByText('Нове:')).not.toBeInTheDocument());
    expect(within(article).queryByRole('button', { name: 'Позначити прочитаним' })).not.toBeInTheDocument();
  });
});

describe('/notifications of the customer: the decision of the moderator on a task (US-40, US-49)', () => {
  const PUBLISHED = 'Ваше завдання «Логотип» опубліковано';
  const REJECTED = 'Ваше завдання «Логотип» відхилено. Причина: домашнє завдання';

  it('US-49 sc.1 «опубліковано» is listed as new and links to the customer card; a payload of another shape gives no link', async () => {
    listResponse = () =>
      json({
        notifications: [
          { id: 'n11', type: 'task_published', text: PUBLISHED, payload: { taskId: 't11', taskTitle: 'Логотип' }, read: false, createdAt: '2026-11-13T10:00:00.000Z' },
          { ...note(true), id: 'n10', type: 'task_published', text: 'Нове сповіщення', payload: { unexpected: true } },
        ],
      });
    open();

    const article = await screen.findByRole('article', { name: PUBLISHED });
    expect(within(article).getByText('Нове:')).toBeInTheDocument();
    expect(within(article).getByRole('link', { name: 'Відкрити завдання' })).toHaveAttribute('href', '/c/tasks/t11');
    expect(screen.getAllByRole('link', { name: 'Відкрити завдання' })).toHaveLength(1); // the bad payload has no link
  });

  it('US-49 sc.2 «відхилено. Причина: …» links to the customer card; a payload without the reason gives no link', async () => {
    listResponse = () =>
      json({
        notifications: [
          { id: 'n13', type: 'task_rejected', text: REJECTED, payload: { taskId: 't13', taskTitle: 'Логотип', reason: 'домашнє завдання' }, read: false, createdAt: '2026-11-13T10:00:00.000Z' },
          { ...note(true), id: 'n12', type: 'task_rejected', text: 'Нове сповіщення', payload: { taskId: 't12', taskTitle: 'Логотип' } },
        ],
      });
    open();

    const article = await screen.findByRole('article', { name: REJECTED });
    expect(within(article).getByRole('link', { name: 'Відкрити завдання' })).toHaveAttribute('href', '/c/tasks/t13');
    expect(screen.getAllByRole('link', { name: 'Відкрити завдання' })).toHaveLength(1);
  });
});

describe('/notifications of the customer (US-48)', () => {
  it('US-48 sc.1 «Студент надіслав результат…» is listed as new and links to the customer card of the task', async () => {
    const text = 'Студент надіслав результат за завданням «Парсер сайту» на перевірку';
    listResponse = () =>
      json({
        notifications: [
          { id: 'n9', type: 'result_submitted', text, payload: { taskId: 't9', taskTitle: 'Парсер сайту' }, read: false, createdAt: '2026-11-13T10:00:00.000Z' },
          { ...note(true), id: 'n8', type: 'result_submitted', text, payload: { unexpected: true } },
        ],
      });
    open();

    const article = await screen.findAllByRole('article', { name: text });
    expect(article).toHaveLength(2);
    expect(within(article[0]!).getByText('Нове:')).toBeInTheDocument();
    const links = screen.getAllByRole('link', { name: 'Відкрити завдання' });
    expect(links).toHaveLength(1); // a payload of another shape gives no link
    expect(links[0]).toHaveAttribute('href', '/c/tasks/t9');
  });
});

describe('/notifications links (US-21)', () => {
  it('US-21 «Вас обрано виконавцем» links to the executor card of the task; a payload of another shape gives no link', async () => {
    listResponse = () => json({ notifications: [note(false), { ...note(true), id: 'n2', payload: { unexpected: true } }] });
    open();

    const links = await screen.findAllByRole('link', { name: 'Відкрити завдання' });
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', '/work/t1');
  });
});

describe('/notifications centre (US-21)', () => {
  it('US-21 sc.1 the student sees «Вас обрано виконавцем завдання [Назва]» marked as new', async () => {
    open();

    const item = await screen.findByRole('article', { name: TEXT });
    expect(within(item).getByText('Нове:')).toBeInTheDocument();
    expect(within(item).getByText(TEXT, { exact: false })).toBeInTheDocument();
  });

  it('US-21 sc.3 an older unread notification is listed on opening the centre, and marking it read removes the new mark', async () => {
    const user = userEvent.setup();
    open();

    const item = await screen.findByRole('article', { name: TEXT });
    await user.click(within(item).getByRole('button', { name: 'Позначити прочитаним' }));

    await vi.waitFor(() => expect(screen.queryByText('Нове:')).not.toBeInTheDocument());
    expect(screen.getByRole('article', { name: TEXT })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Позначити прочитаним' })).not.toBeInTheDocument();
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(post?.[0]).toBe('/api/me/notifications/n1/read');
  });

  it('US-21 with no notifications the page says so', async () => {
    listResponse = () => json({ notifications: [] });
    open();
    expect(await screen.findByText('Сповіщень поки немає.')).toBeInTheDocument();
  });

  it('US-21 a failed load shows the error message', async () => {
    listResponse = () => apiError('INTERNAL_ERROR', 500);
    open();
    expect(await screen.findByRole('alert')).toHaveTextContent('Щось пішло не так');
  });
});
