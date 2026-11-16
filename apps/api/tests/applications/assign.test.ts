import { beforeEach, describe, expect, it } from 'vitest';
import { hashSessionId } from '../../src/modules/identity/domain';
import { prisma as appPrisma } from '../../src/platform/db';
import { api } from '../helpers/app';
import { prisma, resetDb } from '../helpers/db';
import { createApplication, createTask } from '../helpers/factories';

const ORIGIN = 'http://localhost:5173';
const PRICE = 50_000;
let counter = 0;
async function loginAs(role: 'student' | 'customer', overrides: Record<string, unknown> = {}) {
  counter += 1;
  const user = await prisma.user.create({
    data: {
      email: `assign${counter}@${role === 'student' ? 'university.edu.ua' : 'company.com'}`,
      passwordHash: 'x',
      displayName: `Користувач ${counter}`,
      role,
      emailConfirmedAt: new Date(),
      studentVerifiedAt: role === 'student' ? new Date() : null,
      ...overrides,
    },
  });
  const sid = `assign-session-${counter}`;
  await prisma.session.create({ data: { id: hashSessionId(sid), userId: user.id, expiresAt: new Date(Date.now() + 3600_000) } });
  return { user, cookie: `sid=${sid}` };
}

const assign = (taskId: string, body: unknown, cookie?: string, key?: string) => {
  let req = api().post(`/api/tasks/${taskId}/assign`);
  if (cookie) req = req.set('Cookie', cookie).set('Origin', ORIGIN);
  if (key !== undefined) req = req.set('Idempotency-Key', key);
  return req.send(body as object);
};
const fund = (ownerId: string, availableKopecks: number) => prisma.balance.create({ data: { ownerId, availableKopecks } });
const balanceOf = async (ownerId: string) => (await prisma.balance.findUnique({ where: { ownerId } }))?.availableKopecks ?? null;

let customer: Awaited<ReturnType<typeof loginAs>>;
let olena: Awaited<ReturnType<typeof loginAs>>;
let petro: Awaited<ReturnType<typeof loginAs>>;
let ivan: Awaited<ReturnType<typeof loginAs>>;
let task: Awaited<ReturnType<typeof createTask>>;
let appOlena: Awaited<ReturnType<typeof createApplication>>;
let appPetro: Awaited<ReturnType<typeof createApplication>>;
let appIvan: Awaited<ReturnType<typeof createApplication>>;

beforeEach(async () => {
  await resetDb();
  customer = await loginAs('customer');
  olena = await loginAs('student');
  petro = await loginAs('student');
  ivan = await loginAs('student');
  task = await createTask(customer.user.id, { title: 'Логотип для кав’ярні', priceKopecks: PRICE, publishedAt: new Date() });
  appOlena = await createApplication(task.id, olena.user.id, { createdAt: new Date('2026-11-01T10:00:00Z') });
  appPetro = await createApplication(task.id, petro.user.id, { createdAt: new Date('2026-11-02T10:00:00Z') });
  appIvan = await createApplication(task.id, ivan.user.id, { createdAt: new Date('2026-11-03T10:00:00Z') });
  await fund(customer.user.id, 100_000);
});

/** Nothing of the select is left: the task is still published, every application is `sent`, no escrow, no ledger, no notification. */
async function expectNothingChanged(balance = 100_000) {
  const row = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
  expect(row.status).toBe('published');
  expect(row.executorId).toBeNull();
  expect((await prisma.application.findMany({ where: { taskId: task.id } })).map((a) => a.status)).toEqual(['sent', 'sent', 'sent']);
  expect(await prisma.escrow.count()).toBe(0);
  expect(await prisma.ledgerEntry.count()).toBe(0);
  expect(await prisma.notification.count()).toBe(0);
  expect(await balanceOf(customer.user.id)).toBe(balance);
}

describe('POST /api/tasks/:id/assign: US-25', () => {
  it('US-25 sc.1 the owner selects a student: 200, the student is the executor, the chosen application is accepted and the rest rejected', async () => {
    const res = await assign(task.id, { applicationId: appPetro.id }, customer.cookie, 'key-sc1-aaaaaaaa');

    expect(res.status).toBe(200);
    expect(res.body.task).toEqual({ id: task.id, status: 'in_progress', executorId: petro.user.id, priceKopecks: PRICE });
    expect(res.body.escrow).toMatchObject({ status: 'held', amountKopecks: PRICE });
    expect(res.body.applications).toEqual({ accepted: appPetro.id, rejectedCount: 2 });
    const row = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(row.status).toBe('in_progress');
    expect(row.executorId).toBe(petro.user.id);
    expect(row.assignedAt).not.toBeNull();
    const apps = await prisma.application.findMany({ where: { taskId: task.id }, orderBy: { createdAt: 'asc' } });
    expect(apps.map((a) => a.status)).toEqual(['rejected', 'accepted', 'rejected']);
    expect(apps.every((a) => a.decidedAt !== null)).toBe(true);
  });

  it('US-26 sc.1 the hold is the full price: the escrow, one negative hold entry, and the balance down by exactly the price', async () => {
    const res = await assign(task.id, { applicationId: appOlena.id }, customer.cookie, 'key-sc1-bbbbbbbb');

    expect(res.status).toBe(200);
    const escrow = await prisma.escrow.findUniqueOrThrow({ where: { taskId: task.id } });
    expect(escrow).toMatchObject({ status: 'held', amountKopecks: PRICE, customerId: customer.user.id, idempotencyKey: 'key-sc1-bbbbbbbb' });
    expect(await prisma.ledgerEntry.findMany({ where: { taskId: task.id } })).toMatchObject([{ ownerId: customer.user.id, kind: 'hold', amountKopecks: -PRICE }]);
    expect(await balanceOf(customer.user.id)).toBe(100_000 - PRICE);
  });

  it('US-25 sc.2 a second select for another candidate is 409 TASK_ALREADY_ASSIGNED and nothing changes', async () => {
    expect((await assign(task.id, { applicationId: appOlena.id }, customer.cookie, 'key-first-aaaaaaa')).status).toBe(200);

    const res = await assign(task.id, { applicationId: appPetro.id }, customer.cookie, 'key-second-bbbbbb');

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TASK_ALREADY_ASSIGNED');
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).executorId).toBe(olena.user.id);
    expect(await prisma.escrow.count()).toBe(1);
    expect(await prisma.ledgerEntry.count()).toBe(1);
    expect(await balanceOf(customer.user.id)).toBe(100_000 - PRICE);
  });

  it('US-25 sc.2 INV-10 two selects at once: one 200 and one 409, one executor, one escrow, one debit', async () => {
    const [a, b] = await Promise.all([
      assign(task.id, { applicationId: appOlena.id }, customer.cookie, 'key-race-aaaaaaaa'),
      assign(task.id, { applicationId: appPetro.id }, customer.cookie, 'key-race-bbbbbbbb'),
    ]);

    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(await prisma.application.count({ where: { taskId: task.id, status: 'accepted' } })).toBe(1);
    expect(await prisma.escrow.count()).toBe(1);
    expect(await prisma.ledgerEntry.count({ where: { kind: 'hold' } })).toBe(1);
    expect(await balanceOf(customer.user.id)).toBe(100_000 - PRICE);
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe('in_progress');
  });

  it('US-25 sc.3 INV-11 not enough funds is 422 INSUFFICIENT_FUNDS and everything is rolled back', async () => {
    await prisma.balance.update({ where: { ownerId: customer.user.id }, data: { availableKopecks: 30_000 } });

    const res = await assign(task.id, { applicationId: appOlena.id }, customer.cookie, 'key-funds-aaaaaaa');

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INSUFFICIENT_FUNDS');
    await expectNothingChanged(30_000);
  });

  it('US-25 sc.3 a customer with no balance at all is 422 too', async () => {
    await prisma.balance.delete({ where: { ownerId: customer.user.id } });
    const res = await assign(task.id, { applicationId: appOlena.id }, customer.cookie, 'key-funds-bbbbbbb');
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INSUFFICIENT_FUNDS');
    expect(await balanceOf(customer.user.id)).toBeNull();
    await prisma.balance.create({ data: { ownerId: customer.user.id, availableKopecks: 100_000 } });
    await expectNothingChanged();
  });

  it('US-26 sc.3 the same key again returns the same result and charges once', async () => {
    const first = await assign(task.id, { applicationId: appOlena.id }, customer.cookie, 'key-repeat-aaaaaa');
    const again = await assign(task.id, { applicationId: appOlena.id }, customer.cookie, 'key-repeat-aaaaaa');

    expect(first.status).toBe(200);
    expect(again.status).toBe(200);
    expect(again.body.escrow.id).toBe(first.body.escrow.id);
    expect(again.body.applications).toEqual(first.body.applications);
    expect(await prisma.escrow.count()).toBe(1);
    expect(await prisma.ledgerEntry.count()).toBe(1);
    expect(await balanceOf(customer.user.id)).toBe(100_000 - PRICE);
  });

  it('US-26 sc.3 two requests with the same key at once give the same escrow and one charge', async () => {
    const [a, b] = await Promise.all([
      assign(task.id, { applicationId: appOlena.id }, customer.cookie, 'key-double-aaaaaa'),
      assign(task.id, { applicationId: appOlena.id }, customer.cookie, 'key-double-aaaaaa'),
    ]);

    expect([a.status, b.status]).toEqual([200, 200]);
    expect(a.body.escrow.id).toBe(b.body.escrow.id);
    expect(await prisma.escrow.count()).toBe(1);
    expect(await balanceOf(customer.user.id)).toBe(100_000 - PRICE);
  });

  it('US-26 sc.3 a repeat without a key on an assigned task is 409 TASK_ALREADY_ASSIGNED and there is no second charge', async () => {
    expect((await assign(task.id, { applicationId: appOlena.id }, customer.cookie)).status).toBe(200); // the server makes a key
    const again = await assign(task.id, { applicationId: appOlena.id }, customer.cookie);

    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('TASK_ALREADY_ASSIGNED');
    expect(await balanceOf(customer.user.id)).toBe(100_000 - PRICE);
    expect(await prisma.escrow.count()).toBe(1);
  });

  it('US-26 a key already used for another task is 400 VALIDATION_FAILED and nothing is charged', async () => {
    expect((await assign(task.id, { applicationId: appOlena.id }, customer.cookie, 'key-reused-aaaaaa')).status).toBe(200);
    const other = await createTask(customer.user.id, { publishedAt: new Date() });
    const app = await createApplication(other.id, petro.user.id);

    const res = await assign(other.id, { applicationId: app.id }, customer.cookie, 'key-reused-aaaaaa');

    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual([{ field: 'Idempotency-Key', code: 'VALIDATION_FAILED' }]);
    expect(await balanceOf(customer.user.id)).toBe(100_000 - PRICE);
    expect((await prisma.task.findUniqueOrThrow({ where: { id: other.id } })).status).toBe('published');
  });

  it('US-26 a key that is too short is 400 VALIDATION_FAILED and nothing changes', async () => {
    const res = await assign(task.id, { applicationId: appOlena.id }, customer.cookie, 'short');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    await expectNothingChanged();
  });

  it('US-25 the application must belong to the task and be sent: 404 for another task\'s, 409 APPLICATION_NOT_PENDING for a decided one (and the task is not taken)', async () => {
    const other = await createTask(customer.user.id, { publishedAt: new Date() });
    const foreign = await createApplication(other.id, olena.user.id);
    const missing = await assign(task.id, { applicationId: foreign.id }, customer.cookie, 'key-notmine-aaaaaa');
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('NOT_FOUND');

    await prisma.application.update({ where: { id: appOlena.id }, data: { status: 'rejected' } });
    const decided = await assign(task.id, { applicationId: appOlena.id }, customer.cookie, 'key-decided-aaaaaa');
    expect(decided.status).toBe(409);
    expect(decided.body.error.code).toBe('APPLICATION_NOT_PENDING');
    const row = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(row.status).toBe('published');
    expect(row.executorId).toBeNull();
    expect(await prisma.escrow.count()).toBe(0);
    expect(await balanceOf(customer.user.id)).toBe(100_000);
  });

  it.each([
    ['pending_moderation', { status: 'pending_moderation', publishedAt: null }],
    ['past its deadline', { deadlineAt: new Date(Date.now() - 3600_000) }],
  ])('US-25 a task that is %s cannot be selected for: 409 TASK_NOT_OPEN and nothing changes', async (_name, overrides) => {
    await prisma.task.update({ where: { id: task.id }, data: overrides });

    const res = await assign(task.id, { applicationId: appOlena.id }, customer.cookie, 'key-notopen-aaaaaa');

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TASK_NOT_OPEN');
    expect(await prisma.escrow.count()).toBe(0);
    expect(await balanceOf(customer.user.id)).toBe(100_000);
  });

  it('US-25 access: no session 401, a student 403 ROLE_FORBIDDEN, another customer 403 NOT_TASK_OWNER (also with a bad body), an unknown task 404, a bad body 400', async () => {
    expect((await assign(task.id, { applicationId: appOlena.id })).status).toBe(401);
    expect((await assign(task.id, { applicationId: appOlena.id }, olena.cookie)).body.error.code).toBe('ROLE_FORBIDDEN');
    const other = await loginAs('customer');
    expect((await assign(task.id, { applicationId: appOlena.id }, other.cookie)).body.error.code).toBe('NOT_TASK_OWNER');
    expect((await assign(task.id, {}, other.cookie)).status).toBe(403);
    expect((await assign('no-such-task', { applicationId: appOlena.id }, customer.cookie)).status).toBe(404);
    const bad = await assign(task.id, {}, customer.cookie);
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION_FAILED');
    await expectNothingChanged();
  });
});

/** The hook for the fault-injection scenarios (traceability W-08): the notification insert of the transaction throws. */
function failNotificationInsert() {
  const original = appPrisma.$transaction;
  appPrisma.$transaction = ((fn: (tx: object) => unknown, options?: unknown) =>
    (original as (...a: unknown[]) => unknown).call(
      appPrisma,
      (tx: object) =>
        fn(
          new Proxy(tx, {
            get(target, prop) {
              if (prop === 'notification') return { create: () => Promise.reject(new Error('injected failure')) };
              return Reflect.get(target, prop, target);
            },
          }),
        ),
      options,
    )) as never;
  return () => {
    appPrisma.$transaction = original;
  };
}

describe('Selecting an executor re-runs the scenarios that waited for it', () => {
  it('US-21 sc.1 the student gets «Вас обрано виконавцем завдання [Назва]» from the real select, in the same transaction', async () => {
    expect((await assign(task.id, { applicationId: appPetro.id }, customer.cookie, 'key-notify-aaaaaa')).status).toBe(200);

    const list = await api().get('/api/me/notifications').set('Cookie', petro.cookie);
    expect(list.body.notifications).toHaveLength(1);
    expect(list.body.notifications[0]).toMatchObject({ type: 'executor_selected', text: 'Вас обрано виконавцем завдання Логотип для кав’ярні', read: false });
    expect((await api().get('/api/me/notifications').set('Cookie', olena.cookie)).body.notifications).toEqual([]);
  });

  it('US-21 sc.2 a failure at the notification step is 500 INTERNAL_ERROR and nothing is left: no executor, no escrow, no debit, no notification', async () => {
    const restore = failNotificationInsert();
    let res;
    try {
      res = await assign(task.id, { applicationId: appPetro.id }, customer.cookie, 'key-inject-aaaaaaa');
    } finally {
      restore();
    }

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    await expectNothingChanged();
  });

  it('US-20 sc.2, sc.3 the student sees «Прийнято» for the chosen application and «Відхилено» for the others, from the real select', async () => {
    expect((await assign(task.id, { applicationId: appPetro.id }, customer.cookie, 'key-status-aaaaaa')).status).toBe(200);

    const chosen = await api().get('/api/me/applications').set('Cookie', petro.cookie);
    const others = await api().get('/api/me/applications').set('Cookie', olena.cookie);
    expect(chosen.body.applications[0].status).toBe('accepted');
    expect(others.body.applications[0].status).toBe('rejected');
    expect((await api().get('/api/me/applications').set('Cookie', ivan.cookie)).body.applications[0].status).toBe('rejected');
  });

  it('US-22 sc.1, sc.2 the chosen student opens the task and the owner can no longer delete it, from the real select', async () => {
    expect((await assign(task.id, { applicationId: appPetro.id }, customer.cookie, 'key-delete-aaaaaa')).status).toBe(200);

    const card = await api().get(`/api/tasks/${task.id}`).set('Cookie', petro.cookie);
    expect(card.status).toBe(200);
    expect(card.body.task.status).toBe('in_progress');
    const del = await api().delete(`/api/tasks/${task.id}`).set('Cookie', customer.cookie).set('Origin', ORIGIN);
    expect(del.status).toBe(409);
    expect(del.body.error.code).toBe('TASK_HAS_EXECUTOR');
  });
});

/** Runs `action` once, after the service has read the task and before its transaction starts (a race with another request). */
function beforeTransaction(action: () => Promise<unknown>) {
  const original = appPrisma.$transaction;
  appPrisma.$transaction = (async (...args: unknown[]) => {
    appPrisma.$transaction = original;
    await action();
    return (original as (...a: unknown[]) => unknown).apply(appPrisma, args);
  }) as never;
  return () => {
    appPrisma.$transaction = original;
  };
}

describe('The money of a select (INV-11, INV-12, INV-20)', () => {
  it('INV-11 a price that changes between the read and the update is 409 TASK_NOT_OPEN: the amount held is tied to the row that is updated', async () => {
    const restore = beforeTransaction(() => prisma.task.update({ where: { id: task.id }, data: { priceKopecks: 60_000 } }));
    let res;
    try {
      res = await assign(task.id, { applicationId: appOlena.id }, customer.cookie, 'key-price-aaaaaaa');
    } finally {
      restore();
    }

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TASK_NOT_OPEN');
    expect(await prisma.escrow.count()).toBe(0);
    expect(await prisma.ledgerEntry.count()).toBe(0);
    expect(await balanceOf(customer.user.id)).toBe(100_000);
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).executorId).toBeNull();
  });

  it('INV-12 the same key for two different tasks at once: one 200 and one 400 VALIDATION_FAILED, one escrow, one charge (not a 500)', async () => {
    const other = await createTask(customer.user.id, { priceKopecks: PRICE, publishedAt: new Date() });
    const otherApp = await createApplication(other.id, ivan.user.id);

    const [a, b] = await Promise.all([
      assign(task.id, { applicationId: appOlena.id }, customer.cookie, 'key-twotasks-aaaa'),
      assign(other.id, { applicationId: otherApp.id }, customer.cookie, 'key-twotasks-aaaa'),
    ]);

    expect([a.status, b.status].sort()).toEqual([200, 400]);
    const failed = a.status === 400 ? a : b;
    expect(failed.body.error.details).toEqual([{ field: 'Idempotency-Key', code: 'VALIDATION_FAILED' }]);
    expect(await prisma.escrow.count()).toBe(1);
    expect(await prisma.ledgerEntry.count({ where: { kind: 'hold' } })).toBe(1);
    expect(await balanceOf(customer.user.id)).toBe(100_000 - PRICE);
  });

  it('INV-20 after a select the balance equals the sum of its ledger entries (the top-up and the hold)', async () => {
    await prisma.ledgerEntry.create({ data: { ownerId: customer.user.id, kind: 'topup', amountKopecks: 100_000 } });

    expect((await assign(task.id, { applicationId: appOlena.id }, customer.cookie, 'key-inv20-aaaaaaa')).status).toBe(200);

    const sum = await prisma.ledgerEntry.aggregate({ where: { ownerId: customer.user.id }, _sum: { amountKopecks: true } });
    expect(sum._sum.amountKopecks).toBe(100_000 - PRICE);
    expect(await balanceOf(customer.user.id)).toBe(sum._sum.amountKopecks);
  });

  it('INV-20 after a refused select (no funds) nothing moved: the balance still equals the sum of its ledger entries', async () => {
    await prisma.balance.update({ where: { ownerId: customer.user.id }, data: { availableKopecks: 30_000 } });
    await prisma.ledgerEntry.create({ data: { ownerId: customer.user.id, kind: 'topup', amountKopecks: 30_000 } });

    expect((await assign(task.id, { applicationId: appOlena.id }, customer.cookie, 'key-inv20-bbbbbbb')).status).toBe(422);

    const sum = await prisma.ledgerEntry.aggregate({ where: { ownerId: customer.user.id }, _sum: { amountKopecks: true } });
    expect(sum._sum.amountKopecks).toBe(30_000);
    expect(await balanceOf(customer.user.id)).toBe(30_000);
  });
});
