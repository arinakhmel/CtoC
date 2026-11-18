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
      if (url === '/api/tasks/t1/result') return json({ result: null }); // the result block of the card (US-27)
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

  it('US-30 the card that «Ваш результат прийнято…» links to reads a task that is done: its status «Виконано», no upload form and no send button', async () => {
    taskDetails = () => json({ task: { ...work, status: 'done' } });
    openCard();

    expect(await screen.findByRole('heading', { level: 1, name: 'Логотип для кав’ярні' })).toBeInTheDocument();
    expect(await screen.findByText('Виконано')).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Завантаження результату' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Надіслати на перевірку' })).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
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

describe('/work/:taskId card of a done task: the payout breakdown (US-35 sc.1)', () => {
  /** The row of one amount: its label and its value, as the student reads them together. */
  const amountRow = (label: string) => screen.getByText(label).closest('div')!;

  it('US-35 sc.1 the done task card shows the breakdown', async () => {
    taskDetails = () => json({ task: { ...work, status: 'done', priceKopecks: 100_000, commissionKopecks: 10_000, netKopecks: 90_000 } });
    openCard();

    const section = await screen.findByRole('region', { name: 'Виплата' });

    expect(within(section).getByText('Загальна сума').closest('div')).toHaveTextContent(/1\s000 грн/);
    expect(within(section).getByText('Комісія платформи').closest('div')).toHaveTextContent(/100 грн/);
    expect(within(section).getByText('До отримання').closest('div')).toHaveTextContent(/900 грн/);
  });

  it('US-35 sc.1 the numbers are the snapshot of the task, not recalculated: a split of 7000 / 93000 is shown as it is', async () => {
    taskDetails = () => json({ task: { ...work, status: 'done', priceKopecks: 100_000, commissionKopecks: 7_000, netKopecks: 93_000 } });
    openCard();

    await screen.findByRole('region', { name: 'Виплата' });

    expect(amountRow('Комісія платформи')).toHaveTextContent(/70 грн/);
    expect(amountRow('До отримання')).toHaveTextContent(/930 грн/);
  });

  it('US-35 sc.1 a task that is not done yet has no payout breakdown: only the agreed price', async () => {
    openCard(); // in_progress

    expect(await screen.findByText('Узгоджена ціна')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Виплата' })).not.toBeInTheDocument();
    expect(screen.queryByText('Комісія платформи')).not.toBeInTheDocument();
  });

  it('US-35 sc.1 a done task without a stored split shows no breakdown and does not calculate one', async () => {
    taskDetails = () => json({ task: { ...work, status: 'done', commissionKopecks: null, netKopecks: null } });
    openCard();

    expect(await screen.findByText('Узгоджена ціна')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Виплата' })).not.toBeInTheDocument();
    expect(screen.queryByText('До отримання')).not.toBeInTheDocument();
  });
});
