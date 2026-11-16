import { render, screen, within } from '@testing-library/react';
import { RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestRouter, providerFuture } from '../src/app/router';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const apiError = (code: string, status: number) => json({ error: { code, message: 'x' } }, status);

const DEADLINE = '2030-05-20T15:30:00.000Z';
const work = {
  id: 't1',
  title: 'Логотип для кав’ярні',
  description: 'Потрібен логотип у двох кольорах. Файли у форматі SVG.',
  priceKopecks: 50_000,
  commissionKopecks: 5_000,
  netKopecks: 45_000,
  deadlineAt: DEADLINE,
  publishedAt: '2026-11-10T10:00:00.000Z',
  status: 'in_progress',
  assignedAt: '2026-11-11T10:00:00.000Z',
};

let workList: () => Response;
let taskDetails: () => Response;
const originalTz = process.env.TZ;

beforeEach(() => {
  workList = () => json({ tasks: [work] });
  taskDetails = () => json({ task: work });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/me/work') return workList();
      if (url === '/api/tasks/t1') return taskDetails();
      if (url === '/api/tasks/t1/messages') return json({ messages: [] });
      return json({ status: 'ok' });
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

const openList = () => render(<RouterProvider router={createTestRouter(['/me/work'])} future={providerFuture} />);
const openCard = () => render(<RouterProvider router={createTestRouter(['/work/t1'])} future={providerFuture} />);

describe('/me/work «Мої активні завдання» (US-22)', () => {
  it('US-22 sc.1 the list shows the task with its status, agreed price and a link to the card', async () => {
    openList();

    const item = await screen.findByRole('article', { name: 'Логотип для кав’ярні' });
    expect(within(item).getByText('В роботі')).toBeInTheDocument();
    expect(within(item).getByText(/Узгоджена ціна: 500 грн/)).toBeInTheDocument();
    expect(within(item).getByRole('link', { name: 'Логотип для кав’ярні' })).toHaveAttribute('href', '/work/t1');
  });

  it('US-22 an empty list says so and links to the feed', async () => {
    workList = () => json({ tasks: [] });
    openList();
    expect(await screen.findByText(/Активних завдань поки немає/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Знайти завдання' })).toHaveAttribute('href', '/feed');
  });

  it('US-22 an unverified student gets the message and a link to verification', async () => {
    workList = () => apiError('STUDENT_NOT_VERIFIED', 403);
    openList();
    expect(await screen.findByRole('alert')).toHaveTextContent('Завершіть верифікацію статусу студента');
    expect(screen.getByRole('link', { name: 'Пройти верифікацію' })).toHaveAttribute('href', '/me/verification');
  });
});

describe('/work/:taskId card (US-22)', () => {
  it('US-22 sc.1 the card shows the full terms, the agreed price, the status and the deadline', async () => {
    openCard();

    expect(await screen.findByRole('heading', { level: 1, name: 'Логотип для кав’ярні' })).toBeInTheDocument();
    expect(screen.getByText('Потрібен логотип у двох кольорах. Файли у форматі SVG.')).toBeInTheDocument();
    expect(screen.getByText('Узгоджена ціна')).toBeInTheDocument();
    expect(screen.getByText('500 грн')).toBeInTheDocument();
    expect(screen.getByText('В роботі')).toBeInTheDocument();
    expect(screen.getByText('Виконати до:', { exact: false }).querySelector('time')).toHaveAttribute('dateTime', DEADLINE);
  });

  it('US-22 sc.3 the deadline is shown in the time zone of the browser', async () => {
    process.env.TZ = 'Asia/Tokyo'; // UTC+9: 15:30 UTC is 00:30 the next day
    const tokyo = openCard();
    const tokyoTime = (await screen.findByText('Виконати до:', { exact: false })).querySelector('time')!;
    expect(tokyoTime.textContent).toMatch(/21\.05\.2030.*00:30/);
    tokyo.unmount();

    process.env.TZ = 'America/New_York'; // UTC-4 in May: 15:30 UTC is 11:30 the same day
    openCard();
    const nyTime = (await screen.findByText('Виконати до:', { exact: false })).querySelector('time')!;
    expect(nyTime.textContent).toMatch(/20\.05\.2030.*11:30/);
  });

  it('US-22 sc.1 a feed task that is not the student\'s (no status in the answer) is not shown as an agreed task', async () => {
    const { status: _status, assignedAt: _assignedAt, ...feedTask } = work;
    taskDetails = () => json({ task: feedTask });
    openCard();

    expect(await screen.findByRole('alert')).toHaveTextContent('Не знайдено');
    expect(screen.queryByText('Узгоджена ціна')).not.toBeInTheDocument();
    expect(screen.queryByText('Потрібен логотип', { exact: false })).not.toBeInTheDocument();
  });

  it('US-22 a task that is not the student\'s shows the not-found message', async () => {
    taskDetails = () => apiError('NOT_FOUND', 404);
    openCard();
    expect(await screen.findByRole('alert')).toHaveTextContent('Не знайдено');
  });
});
