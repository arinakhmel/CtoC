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
      email: `detail${counter}@university.edu.ua`,
      passwordHash: 'x',
      displayName: 'Олена Коваль',
      role: 'student',
      emailConfirmedAt: new Date(),
      ...overrides,
    },
  });
  const sid = `detail-session-${counter}`;
  await prisma.session.create({ data: { id: hashSessionId(sid), userId: user.id, expiresAt: new Date(Date.now() + 3600_000) } });
  return { user, cookie: `sid=${sid}` };
}

let customerId: string;
const publish = (overrides: Record<string, unknown> = {}) => createTask(customerId, { publishedAt: new Date(), ...overrides });
const getTask = (id: string, cookie?: string) => {
  const req = api().get(`/api/tasks/${id}`);
  return cookie ? req.set('Cookie', cookie) : req;
};

beforeEach(async () => {
  await resetDb();
  customerId = (await createUser({ role: 'customer', email: 'owner@company.com' })).id;
});

describe('GET /api/tasks/:id: US-13 sc.1', () => {
  it('US-13 sc.1 a student gets 200 with the fixed price set by the customer', async () => {
    const { cookie } = await loginAs();
    const task = await publish({ title: 'Парсер сайту', description: 'Потрібен скрипт.', priceKopecks: 50_000 });

    const res = await getTask(task.id, cookie);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      task: {
        id: task.id,
        title: 'Парсер сайту',
        description: 'Потрібен скрипт.',
        priceKopecks: 50_000,
        commissionKopecks: null, // no snapshot on this row (US-15)
        netKopecks: null,
        deadlineAt: task.deadlineAt.toISOString(),
        publishedAt: task.publishedAt!.toISOString(),
      },
    });
  });

  it('US-13 sc.1 the details do not expose the customer, the status or moderation data', async () => {
    const { cookie } = await loginAs();
    const task = await publish();
    const res = await getTask(task.id, cookie);
    expect(Object.keys(res.body.task).sort()).toEqual([
      'commissionKopecks',
      'deadlineAt',
      'description',
      'id',
      'netKopecks',
      'priceKopecks',
      'publishedAt',
      'title',
    ]);
  });

  it.each([
    ['pending moderation', { status: 'pending_moderation', publishedAt: null }],
    ['rejected', { status: 'rejected', publishedAt: null }],
  ])('US-13 sc.1 a %s task is 404 NOT_FOUND', async (_name, overrides) => {
    const { cookie } = await loginAs();
    const task = await publish(overrides);
    const res = await getTask(task.id, cookie);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('US-13 sc.1 a task with an executor or a past deadline is 404 NOT_FOUND (same visibility as the feed)', async () => {
    const { cookie, user } = await loginAs();
    const taken = await publish({ executorId: user.id, status: 'in_progress' });
    const expired = await publish({ deadlineAt: new Date(Date.now() - 3600_000) });
    expect((await getTask(taken.id, cookie)).status).toBe(404);
    expect((await getTask(expired.id, cookie)).status).toBe(404);
  });

  it('US-13 sc.1 an unknown id is 404 NOT_FOUND', async () => {
    const { cookie } = await loginAs();
    const res = await getTask('no-such-task', cookie);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('US-13 sc.1 no session is 401 AUTH_REQUIRED', async () => {
    const task = await publish();
    const res = await getTask(task.id);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_REQUIRED');
  });

  it('US-13 sc.1 a customer is 403 ROLE_FORBIDDEN', async () => {
    const task = await publish();
    const { cookie } = await loginAs({ role: 'customer' });
    const res = await getTask(task.id, cookie);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ROLE_FORBIDDEN');
  });

  it('US-13 sc.1 a student with an unconfirmed email is 403 EMAIL_NOT_CONFIRMED', async () => {
    const task = await publish();
    const { cookie } = await loginAs({ emailConfirmedAt: null });
    const res = await getTask(task.id, cookie);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('EMAIL_NOT_CONFIRMED');
  });
});

// US-13 sc.2 (a forged priceKopecks in POST /api/tasks/:id/applications is stripped, 201, W-05) is tested in tests/applications/apply.test.ts.
