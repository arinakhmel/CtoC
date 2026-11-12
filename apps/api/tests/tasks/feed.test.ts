import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { hashSessionId } from '../../src/modules/identity/domain';
import { api } from '../helpers/app';
import { prisma, resetDb } from '../helpers/db';
import { createTask, createUser } from '../helpers/factories';

let counter = 0;
async function loginAs(overrides: Record<string, unknown> = {}) {
  counter += 1;
  const user = await prisma.user.create({
    data: {
      email: `feed${counter}@university.edu.ua`,
      passwordHash: 'x',
      displayName: 'Олена Коваль',
      role: 'student',
      emailConfirmedAt: new Date(),
      ...overrides,
    },
  });
  const sid = `feed-session-${counter}`;
  await prisma.session.create({ data: { id: hashSessionId(sid), userId: user.id, expiresAt: new Date(Date.now() + 3600_000) } });
  return { user, cookie: `sid=${sid}` };
}

const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000);
const getFeed = (cookie?: string, query = '') => {
  const req = api().get(`/api/tasks${query}`);
  return cookie ? req.set('Cookie', cookie) : req;
};

let customerId: string;
const publish = (overrides: Record<string, unknown> = {}) => createTask(customerId, { publishedAt: new Date(), ...overrides });

beforeEach(async () => {
  await resetDb();
  customerId = (await createUser({ role: 'customer', email: 'owner@company.com' })).id;
});

describe('GET /api/tasks: US-12 sc.1', () => {
  it.each([
    ['a verified student', { studentVerifiedAt: new Date() }],
    ['a student who is not verified yet', {}],
  ])('US-12 sc.1 %s gets 200 and a card with description, price and deadline (OQ-19)', async (_name, overrides) => {
    const { cookie } = await loginAs(overrides);
    const task = await publish({ title: 'Парсер сайту', description: 'Потрібен скрипт.', priceKopecks: 50_000 });

    const res = await getFeed(cookie);

    expect(res.status).toBe(200);
    expect(res.body.nextCursor).toBeNull();
    expect(res.body.tasks).toEqual([
      {
        id: task.id,
        title: 'Парсер сайту',
        description: 'Потрібен скрипт.',
        priceKopecks: 50_000,
        commissionKopecks: null, // no snapshot on this row (US-15)
        netKopecks: null,
        deadlineAt: task.deadlineAt.toISOString(),
        publishedAt: task.publishedAt!.toISOString(),
      },
    ]);
  });

  it('US-12 sc.1 an empty feed is 200 with an empty list', async () => {
    const { cookie } = await loginAs();
    const res = await getFeed(cookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ tasks: [], nextCursor: null });
  });

  it('US-12 sc.1 INV-06: only published tasks without an executor and with a future deadline are listed', async () => {
    const { cookie, user } = await loginAs();
    const visible = await publish({ title: 'Видиме завдання' });
    await publish({ title: 'На модерації', status: 'pending_moderation', publishedAt: null });
    await publish({ title: 'Відхилене', status: 'rejected', publishedAt: null });
    await publish({ title: 'Скасоване', status: 'cancelled' });
    await publish({ title: 'Вже в роботі', status: 'in_progress', executorId: user.id });
    await publish({ title: 'Строк минув', deadlineAt: new Date(Date.now() - 1000) });

    const res = await getFeed(cookie);

    expect(res.status).toBe(200);
    expect(res.body.tasks.map((t: { id: string }) => t.id)).toEqual([visible.id]);
  });

  it('US-12 sc.1 the newest published task comes first and pages follow by cursor without gaps or repeats', async () => {
    const { cookie } = await loginAs();
    const tasks = [];
    for (let i = 0; i < 5; i += 1) tasks.push(await publish({ title: `Завдання ${i + 1}`, publishedAt: minutesAgo(50 - i * 10) }));
    const expected = [...tasks].reverse().map((t) => t.id); // newest first

    const first = await getFeed(cookie, '?limit=2');
    expect(first.status).toBe(200);
    expect(first.body.tasks.map((t: { id: string }) => t.id)).toEqual(expected.slice(0, 2));
    expect(first.body.nextCursor).toBe(expected[1]);

    const second = await getFeed(cookie, `?limit=2&cursor=${first.body.nextCursor}`);
    expect(second.body.tasks.map((t: { id: string }) => t.id)).toEqual(expected.slice(2, 4));
    expect(second.body.nextCursor).toBe(expected[3]);

    const third = await getFeed(cookie, `?limit=2&cursor=${second.body.nextCursor}`);
    expect(third.body.tasks.map((t: { id: string }) => t.id)).toEqual(expected.slice(4));
    expect(third.body.nextCursor).toBeNull();
  });

  it('US-12 sc.1 tasks published at the same moment are ordered by id and none is lost between pages', async () => {
    const { cookie } = await loginAs();
    const at = minutesAgo(5);
    const tasks = await Promise.all([publish({ publishedAt: at }), publish({ publishedAt: at }), publish({ publishedAt: at })]);
    const expected = tasks.map((t) => t.id).sort().reverse();

    const first = await getFeed(cookie, '?limit=2');
    const second = await getFeed(cookie, `?limit=2&cursor=${first.body.nextCursor}`);

    const ids = [...first.body.tasks, ...second.body.tasks].map((t: { id: string }) => t.id);
    expect(ids).toEqual(expected);
  });

  it('US-12 sc.1 a task taken while the student reads page one does not break the cursor of page two', async () => {
    const { cookie, user } = await loginAs();
    const [a, b, c] = [
      await publish({ publishedAt: minutesAgo(1) }),
      await publish({ publishedAt: minutesAgo(2) }),
      await publish({ publishedAt: minutesAgo(3) }),
    ];
    const first = await getFeed(cookie, '?limit=1');
    expect(first.body.nextCursor).toBe(a.id);
    await prisma.task.update({ where: { id: a.id }, data: { status: 'in_progress', executorId: user.id } });

    const second = await getFeed(cookie, `?limit=5&cursor=${first.body.nextCursor}`);

    expect(second.status).toBe(200);
    expect(second.body.tasks.map((t: { id: string }) => t.id)).toEqual([b.id, c.id]);
  });

  it('US-12 sc.1 the card does not expose the customer, the status or moderation data', async () => {
    const { cookie } = await loginAs();
    await publish({ moderationReason: 'internal' });

    const res = await getFeed(cookie);

    expect(Object.keys(res.body.tasks[0]).sort()).toEqual([
      'commissionKopecks',
      'deadlineAt',
      'description',
      'id',
      'netKopecks',
      'priceKopecks',
      'publishedAt',
      'title',
    ]);
    expect(JSON.stringify(res.body)).not.toContain('owner@company.com');
  });

  it.each([['limit=0'], ['limit=51'], ['limit=abc'], ['cursor=no-such-task']])('US-12 query %s is 400 VALIDATION_FAILED', async (query) => {
    const { cookie } = await loginAs();
    const res = await getFeed(cookie, `?${query}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.details).toHaveLength(1);
  });
});

describe('tasks.deadline_at: US-12 sc.2', () => {
  // W-10, decided: a task without a deadline cannot exist, so the feed never has to skip one.
  it('US-12 sc.2 inserting a task without a deadline fails (NOT NULL), so it can never reach the feed', async () => {
    const now = Date.now();
    await expect(
      prisma.$executeRaw`INSERT INTO tasks (id, customer_id, title, description, price_kopecks, status, deadline_at, created_at, updated_at)
        VALUES (${randomUUID()}, ${customerId}, 'Парсер сайту', 'Опис', 50000, 'published', NULL, ${now}, ${now})`,
    ).rejects.toThrow(/null|constraint/i);
    expect(await prisma.task.count()).toBe(0);
  });
});

describe('GET /api/tasks: US-12 sc.3', () => {
  it('US-12 sc.3 no session is 401 AUTH_REQUIRED', async () => {
    await publish();
    const res = await getFeed();
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_REQUIRED');
  });

  it('US-12 sc.3 an unknown session cookie is 401 AUTH_REQUIRED', async () => {
    const res = await getFeed('sid=does-not-exist');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_REQUIRED');
  });

  it('US-12 sc.3 a customer is 403 ROLE_FORBIDDEN (OQ-19)', async () => {
    const { cookie } = await loginAs({ role: 'customer' });
    const res = await getFeed(cookie);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ROLE_FORBIDDEN');
  });

  it('US-12 sc.3 a student with an unconfirmed email is 403 EMAIL_NOT_CONFIRMED (OQ-19)', async () => {
    const { cookie } = await loginAs({ emailConfirmedAt: null });
    const res = await getFeed(cookie);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('EMAIL_NOT_CONFIRMED');
  });

  it('US-12 sc.3 access is checked before the query: a forbidden user with a bad limit still gets 403', async () => {
    const { cookie } = await loginAs({ role: 'customer' });
    const res = await getFeed(cookie, '?limit=abc');
    expect(res.status).toBe(403);
  });
});
