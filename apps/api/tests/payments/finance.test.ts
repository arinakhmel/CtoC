import { randomUUID } from 'node:crypto';
import { LIMITS } from '@ctoc/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hashSessionId } from '../../src/modules/identity/domain';
import { api } from '../helpers/app';
import { prisma, resetDb } from '../helpers/db';
import { createTask } from '../helpers/factories';

/**
 * US-35 (the breakdown of the student's money) and US-34 sc.1 (the credited amount is available on the finance page):
 * `GET /api/me/finance`, api.md §4.1b. The numbers come from the snapshot on the task (A-07), never from the current rate.
 */

const ORIGIN = 'http://localhost:5173';

let counter = 0;
async function loginAs(role: 'student' | 'customer', overrides: Record<string, unknown> = {}) {
  counter += 1;
  const user = await prisma.user.create({
    data: {
      email: `finance${counter}@${role === 'student' ? 'university.edu.ua' : 'company.com'}`,
      passwordHash: 'x',
      displayName: 'Користувач',
      role,
      emailConfirmedAt: new Date(),
      studentVerifiedAt: role === 'student' ? new Date() : null,
      ...overrides,
    },
  });
  const sid = `finance-session-${counter}`;
  await prisma.session.create({ data: { id: hashSessionId(sid), userId: user.id, expiresAt: new Date(Date.now() + 3600_000) } });
  return { user, cookie: `sid=${sid}` };
}

type Login = Awaited<ReturnType<typeof loginAs>>;

const finance = (cookie?: string) => {
  const req = api().get('/api/me/finance');
  return cookie ? req.set('Cookie', cookie) : req;
};
const accept = (taskId: string, cookie: string) => api().post(`/api/tasks/${taskId}/accept`).set('Cookie', cookie).set('Origin', ORIGIN);

let customer: Login;
let student: Login;

/** A task under review as the real flow leaves it: the full price held, the split taken at publication, a submitted version. */
async function reviewTask(owner: Login, executor: Login, price: number, commission: number, overrides: Record<string, unknown> = {}) {
  const task = await createTask(owner.user.id, {
    status: 'in_review',
    executorId: executor.user.id,
    publishedAt: new Date(),
    assignedAt: new Date(),
    priceKopecks: price,
    commissionBp: 1000,
    commissionKopecks: commission,
    netKopecks: price - commission,
    ...overrides,
  });
  await prisma.escrow.create({ data: { taskId: task.id, customerId: owner.user.id, amountKopecks: price, status: 'held', idempotencyKey: randomUUID() } });
  await prisma.balance.upsert({ where: { ownerId: owner.user.id }, create: { ownerId: owner.user.id, availableKopecks: 0 }, update: {} });
  await prisma.ledgerEntry.createMany({
    data: [
      { ownerId: owner.user.id, kind: 'topup', amountKopecks: price },
      { ownerId: owner.user.id, kind: 'hold', amountKopecks: -price, taskId: task.id },
    ],
  });
  await prisma.resultVersion.create({ data: { taskId: task.id, version: 1, status: 'submitted', submittedAt: new Date() } });
  return task;
}

/** A finished task of the student with the given snapshot, without going through the accept. */
const doneTask = (executor: Login, completedAt: Date, overrides: Record<string, unknown> = {}) =>
  createTask(customer.user.id, {
    status: 'done',
    executorId: executor.user.id,
    publishedAt: new Date(),
    assignedAt: new Date(),
    completedAt,
    priceKopecks: 100_000,
    commissionBp: 1000,
    commissionKopecks: 10_000,
    netKopecks: 90_000,
    ...overrides,
  });

beforeEach(async () => {
  await resetDb();
  customer = await loginAs('customer');
  student = await loginAs('student');
});

afterEach(() => vi.restoreAllMocks());

describe('The breakdown of a payment: US-35 sc.1', () => {
  it('US-35 sc.1 a task of 1000 UAH at 10 % is 100000 / 10000 / 90000 kopecks, after a real accept', async () => {
    const task = await reviewTask(customer, student, 100_000, 10_000, { title: 'Логотип для кав’ярні' });
    expect((await accept(task.id, customer.cookie)).status).toBe(200);

    const res = await finance(student.cookie);

    expect(res.status).toBe(200);
    const completedAt = (await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).completedAt!;
    expect(res.body).toEqual({
      balance: { availableKopecks: 90_000 },
      tasks: [
        {
          taskId: task.id,
          title: 'Логотип для кав’ярні',
          grossKopecks: 100_000,
          commissionKopecks: 10_000,
          netKopecks: 90_000,
          paidAt: completedAt.toISOString(),
        },
      ],
    });
  });

  it('US-35 sc.1 (A-07) the numbers are the snapshot of the task, not today\'s rate: a split of 7000 / 93000 is returned as it is', async () => {
    await doneTask(student, new Date(), { commissionBp: 700, commissionKopecks: 7_000, netKopecks: 93_000 });

    const res = await finance(student.cookie);

    expect(res.body.tasks).toHaveLength(1);
    expect(res.body.tasks[0]).toMatchObject({ grossKopecks: 100_000, commissionKopecks: 7_000, netKopecks: 93_000 });
  });

  it('US-35 sc.1 the amounts are whole numbers and gross = commission + net, also for odd kopecks (INV-08)', async () => {
    await doneTask(student, new Date(), { priceKopecks: 99_999, commissionKopecks: 10_000, netKopecks: 89_999 });
    await doneTask(student, new Date(Date.now() - 1000), { priceKopecks: 5, commissionKopecks: 1, netKopecks: 4 });

    const res = await finance(student.cookie);

    for (const row of res.body.tasks as { grossKopecks: number; commissionKopecks: number; netKopecks: number }[]) {
      expect(Number.isInteger(row.grossKopecks) && Number.isInteger(row.commissionKopecks) && Number.isInteger(row.netKopecks)).toBe(true);
      expect(row.commissionKopecks + row.netKopecks).toBe(row.grossKopecks);
    }
  });

  it('US-35 sc.1 the newest payment is first, and the same moment is ordered by the task id, newest first', async () => {
    const old = await doneTask(student, new Date('2026-11-01T10:00:00Z'), { title: 'Стара задача' });
    const recent = await doneTask(student, new Date('2026-11-17T10:00:00Z'), { title: 'Нова задача' });
    const tieA = await doneTask(student, new Date('2026-11-10T10:00:00Z'), { title: 'Однаковий час A' });
    const tieB = await doneTask(student, new Date('2026-11-10T10:00:00Z'), { title: 'Однаковий час B' });

    const res = await finance(student.cookie);

    const [firstTie, secondTie] = [tieA.id, tieB.id].sort().reverse();
    expect((res.body.tasks as { taskId: string }[]).map((row) => row.taskId)).toEqual([recent.id, firstTie, secondTie, old.id]);
  });

  it('US-35 sc.1 a student with no paid task gets balance 0 and an empty list', async () => {
    const res = await finance(student.cookie);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ balance: { availableKopecks: 0 }, tasks: [] });
  });

  it('US-35 sc.1 the list is the full list up to the same cap as GET /api/me/work (100)', async () => {
    const base = Date.now();
    await prisma.task.createMany({
      data: Array.from({ length: LIMITS.myWorkMax + 1 }, (_, i) => ({
        customerId: customer.user.id,
        title: `Задача ${i}`,
        description: 'Опис',
        priceKopecks: 10_000,
        deadlineAt: new Date(base + 7 * 24 * 3600 * 1000),
        status: 'done',
        executorId: student.user.id,
        commissionBp: 1000,
        commissionKopecks: 1_000,
        netKopecks: 9_000,
        completedAt: new Date(base - i * 1000),
      })),
    });

    const res = await finance(student.cookie);

    expect(res.body.tasks).toHaveLength(LIMITS.myWorkMax);
    expect(res.body.tasks[0].title).toBe('Задача 0'); // the newest is kept, the oldest is the one that is cut
  });

  it('US-35 sc.1 the answer is not cached: a balance that just changed shows on the next request', async () => {
    const res = await finance(student.cookie);

    expect(res.headers['cache-control']).toContain('no-store');
  });
});

describe('Whose tasks and which tasks: US-35', () => {
  it('US-35 sc.1 another student\'s tasks are never returned, and each student sees only their own', async () => {
    const other = await loginAs('student');
    const mine = await doneTask(student, new Date());
    const theirs = await doneTask(other, new Date(), { title: 'Чужа задача' });

    const own = await finance(student.cookie);
    const foreign = await finance(other.cookie);

    expect((own.body.tasks as { taskId: string }[]).map((row) => row.taskId)).toEqual([mine.id]);
    expect((foreign.body.tasks as { taskId: string }[]).map((row) => row.taskId)).toEqual([theirs.id]);
    expect(JSON.stringify(own.body)).not.toContain('Чужа задача');
  });

  it('US-35 sc.1 a task that is not done is not returned: in progress, in review, revision and cancelled', async () => {
    for (const status of ['in_progress', 'in_review', 'revision', 'cancelled']) {
      await doneTask(student, new Date(), { status, completedAt: null });
    }
    const paid = await doneTask(student, new Date());

    const res = await finance(student.cookie);

    expect((res.body.tasks as { taskId: string }[]).map((row) => row.taskId)).toEqual([paid.id]);
  });

  it('US-34 sc.1 the credited net amount is available to withdraw on the finance page, and a second accept adds one more row', async () => {
    const first = await reviewTask(customer, student, 100_000, 10_000);
    await accept(first.id, customer.cookie);
    const second = await reviewTask(customer, student, 50_000, 5_000);
    await accept(second.id, customer.cookie);

    const res = await finance(student.cookie);

    expect(res.body.balance.availableKopecks).toBe(90_000 + 45_000);
    expect(res.body.tasks).toHaveLength(2);
    expect((res.body.tasks as { netKopecks: number }[]).reduce((sum, row) => sum + row.netKopecks, 0)).toBe(res.body.balance.availableKopecks);
  });
});

describe('Access to the finance page: US-35, US-34', () => {
  it('US-35 sc.1 access: no session is 401 AUTH_REQUIRED', async () => {
    const res = await finance();

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_REQUIRED');
  });

  it('US-35 sc.1 access: a customer is 403 ROLE_FORBIDDEN, although a customer may read their balance', async () => {
    const res = await finance(customer.cookie);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ROLE_FORBIDDEN');
    expect((await api().get('/api/me/balance').set('Cookie', customer.cookie)).status).toBe(200);
  });

  it('US-35 sc.1 access: a student with an unconfirmed email is 403 EMAIL_NOT_CONFIRMED', async () => {
    const unconfirmed = await loginAs('student', { emailConfirmedAt: null });

    const res = await finance(unconfirmed.cookie);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('EMAIL_NOT_CONFIRMED');
  });

  it('US-35 sc.1 access: a student who is not verified yet is 403 STUDENT_NOT_VERIFIED', async () => {
    const unverified = await loginAs('student', { studentVerifiedAt: null });

    const res = await finance(unverified.cookie);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('STUDENT_NOT_VERIFIED');
  });
});

describe('A broken price split is not hidden and not recomputed: OQ-39 (a)', () => {
  it('US-35 sc.1 a done task with no split (NULL snapshot) is 500 INTERNAL_ERROR, logged, with no internals in the body', async () => {
    const broken = await doneTask(student, new Date(), { commissionBp: null, commissionKopecks: null, netKopecks: null, title: 'Без знімка' });
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const res = await finance(student.cookie);

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(res.body)).not.toContain(broken.id);
    expect(JSON.stringify(res.body)).not.toContain('Без знімка');
    expect(JSON.stringify(res.body)).not.toContain('commission');
    expect(logged).toHaveBeenCalledWith(expect.stringContaining(broken.id));
  });
});
