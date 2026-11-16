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
      email: `work${counter}@university.edu.ua`,
      passwordHash: 'x',
      displayName: 'Олена Коваль',
      role: 'student',
      emailConfirmedAt: new Date(),
      studentVerifiedAt: new Date(),
      ...overrides,
    },
  });
  const sid = `work-session-${counter}`;
  await prisma.session.create({ data: { id: hashSessionId(sid), userId: user.id, expiresAt: new Date(Date.now() + 3600_000) } });
  return { user, cookie: `sid=${sid}` };
}

const get = (url: string, cookie?: string) => (cookie ? api().get(url).set('Cookie', cookie) : api().get(url));

let customerId: string;
// The assign endpoint (US-25) does not exist yet, so a task with an executor is a seeded row (traceability W-09).
const assigned = (executorId: string, overrides: Record<string, unknown> = {}) =>
  createTask(customerId, {
    title: 'Логотип для кав’ярні',
    description: 'Потрібен логотип у двох кольорах.',
    priceKopecks: 50_000,
    status: 'in_progress',
    executorId,
    publishedAt: new Date(),
    assignedAt: new Date(),
    ...overrides,
  });

beforeEach(async () => {
  await resetDb();
  customerId = (await createUser({ role: 'customer', email: 'owner@company.com' })).id;
});

describe('Executor sees the task: US-22', () => {
  it('US-22 sc.1 the assigned executor opens the task: 200 with the full terms, the deadline and the agreed price', async () => {
    const { user, cookie } = await loginAs();
    const deadline = new Date('2030-05-20T15:30:00.000Z');
    const task = await assigned(user.id, { deadlineAt: deadline });

    const res = await get(`/api/tasks/${task.id}`, cookie);

    expect(res.status).toBe(200);
    expect(res.body.task).toMatchObject({
      id: task.id,
      title: 'Логотип для кав’ярні',
      description: 'Потрібен логотип у двох кольорах.',
      priceKopecks: 50_000,
      deadlineAt: deadline.toISOString(),
      status: 'in_progress',
    });
    expect(typeof res.body.task.assignedAt).toBe('string');
    expect(res.body.task).not.toHaveProperty('customerId');
    // the task has left the feed, yet the executor can still read it
    expect((await get('/api/tasks', cookie)).body.tasks).toEqual([]);
  });

  it('US-22 sc.1 another student gets 404 NOT_FOUND for a task that is assigned to someone else', async () => {
    const { user } = await loginAs();
    const other = await loginAs();
    const task = await assigned(user.id);

    const res = await get(`/api/tasks/${task.id}`, other.cookie);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('US-22 sc.1 «Мої активні завдання» lists the tasks of the executor, last assigned first, and nobody else\'s', async () => {
    const { user, cookie } = await loginAs();
    const other = await loginAs();
    const older = await assigned(user.id, { title: 'Старіше завдання', assignedAt: new Date('2026-11-01T10:00:00Z') });
    const newer = await assigned(user.id, { title: 'Новіше завдання', assignedAt: new Date('2026-11-02T10:00:00Z'), status: 'in_review' });
    await assigned(other.user.id, { title: 'Чуже завдання' });

    const res = await get('/api/me/work', cookie);

    expect(res.status).toBe(200);
    expect(res.body.tasks.map((t: { id: string }) => t.id)).toEqual([newer.id, older.id]);
    expect(res.body.tasks[0]).toMatchObject({ title: 'Новіше завдання', status: 'in_review', priceKopecks: 50_000 });
  });

  it('US-22 a student with no tasks gets an empty list', async () => {
    const { cookie } = await loginAs();
    const res = await get('/api/me/work', cookie);
    expect(res.status).toBe(200);
    expect(res.body.tasks).toEqual([]);
  });

  it('US-22 /api/me/work: no session is 401, a customer 403 ROLE_FORBIDDEN, an unverified student 403 STUDENT_NOT_VERIFIED, an unconfirmed email 403 EMAIL_NOT_CONFIRMED', async () => {
    expect((await get('/api/me/work')).status).toBe(401);
    const customer = await loginAs({ role: 'customer', studentVerifiedAt: null });
    expect((await get('/api/me/work', customer.cookie)).body.error.code).toBe('ROLE_FORBIDDEN');
    const unverified = await loginAs({ studentVerifiedAt: null });
    const a = await get('/api/me/work', unverified.cookie);
    expect(a.status).toBe(403);
    expect(a.body.error.code).toBe('STUDENT_NOT_VERIFIED');
    const unconfirmed = await loginAs({ emailConfirmedAt: null });
    expect((await get('/api/me/work', unconfirmed.cookie)).body.error.code).toBe('EMAIL_NOT_CONFIRMED');
  });
});
