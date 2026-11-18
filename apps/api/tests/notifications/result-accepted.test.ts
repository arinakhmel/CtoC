import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { hashSessionId } from '../../src/modules/identity/domain';
import { notifyResultAccepted } from '../../src/modules/notifications/service';
import { prisma as appPrisma } from '../../src/platform/db';
import { api } from '../helpers/app';
import { prisma, resetDb } from '../helpers/db';
import { createTask } from '../helpers/factories';

/**
 * US-30. WHAT THESE TESTS ARE, AND ARE NOT.
 *
 * These tests check the MECHANISM of US-30, on its own, without the accept (the real accept is US-31 and is tested through its
 * endpoint in accept-result.test.ts, where US-30 sc.1, sc.2 and sc.3 are covered again, in the real transaction):
 * `notifyResultAccepted(tx, …)` writes the notification on the CALLER's transaction, with the exact text of the story, and the
 * notification centre lists it. The transaction that stands in for the accept is written in the test (`acceptLikeTransaction`):
 * it moves the task to `done`, which the real accept will also do, and then calls the function. It does NOT credit a payout
 * or release an escrow, so «Оплату нараховано» is not backed by money in these tests.
 *
 * The real chain, with the payout, the escrow, the experience record and this notification in one transaction (INV-18), is in
 * accept-result.test.ts (OQ-38).
 */

const ORIGIN = 'http://localhost:5173';
const TEXT = 'Ваш результат прийнято замовником! Оплату нараховано';

let counter = 0;
async function loginAs(role: 'student' | 'customer') {
  counter += 1;
  const user = await prisma.user.create({
    data: {
      email: `accepted${counter}@${role === 'student' ? 'university.edu.ua' : 'company.com'}`,
      passwordHash: 'x',
      displayName: 'Користувач',
      role,
      emailConfirmedAt: new Date(),
      studentVerifiedAt: role === 'student' ? new Date() : null,
    },
  });
  const sid = `accepted-session-${counter}`;
  await prisma.session.create({ data: { id: hashSessionId(sid), userId: user.id, expiresAt: new Date(Date.now() + 3600_000) } });
  return { user, cookie: `sid=${sid}` };
}

const list = (cookie: string, query = '') => api().get(`/api/me/notifications${query}`).set('Cookie', cookie);
const markRead = (id: string, cookie: string) => api().post(`/api/me/notifications/${id}/read`).set('Cookie', cookie).set('Origin', ORIGIN).send({});

let customer: Awaited<ReturnType<typeof loginAs>>;
let student: Awaited<ReturnType<typeof loginAs>>;
const reviewTask = () =>
  createTask(customer.user.id, { status: 'in_review', executorId: student.user.id, publishedAt: new Date(), assignedAt: new Date() });

/**
 * The stand-in for the transaction of the accept (US-31): the task goes `in_review` -> `done` by a conditional update, then the
 * notification is written on the same `tx`. `failAfter` makes the transaction fail after the notification, like a database
 * error in a later step of the accept.
 */
const acceptLikeTransaction = (task: { id: string; title: string }, options: { failAfter?: boolean } = {}) =>
  appPrisma.$transaction(async (tx) => {
    const moved = await tx.task.updateMany({ where: { id: task.id, status: 'in_review' }, data: { status: 'done', completedAt: new Date() } });
    if (moved.count === 0) throw new Error('the stand-in accept found the task not in review');
    await notifyResultAccepted(tx, student.user.id, task);
    if (options.failAfter) throw new Error('injected failure');
  });

/** The hook of the fault-injection scenarios (traceability W-08): the notification insert of the transaction throws. */
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

const seedAccepted = (userId: string, overrides: Record<string, unknown> = {}) =>
  prisma.notification.create({
    data: { userId, type: 'result_accepted', payloadJson: JSON.stringify({ taskId: 't', taskTitle: 'Парсер сайту' }), ...overrides },
  });

beforeEach(async () => {
  await resetDb();
  customer = await loginAs('customer');
  student = await loginAs('student');
});

describe('US-30 mechanism sc.1: the notification is written on the caller\'s transaction (the real accept is in accept-result.test.ts)', () => {
  it('US-30 sc.1 [mechanism] the student reads the exact text, unread, with the task in the payload; the title is not in the text', async () => {
    const task = await reviewTask();

    await acceptLikeTransaction(task);

    const res = await list(student.cookie);
    expect(res.status).toBe(200);
    expect(res.body.notifications).toHaveLength(1);
    expect(res.body.notifications[0]).toMatchObject({
      type: 'result_accepted',
      text: TEXT,
      read: false,
      payload: { taskId: task.id, taskTitle: 'Парсер сайту' },
    });
    expect(res.body.notifications[0].text).not.toContain('Парсер сайту');
  });

  it('US-30 sc.1 [mechanism] only the student is told: the customer and another student get nothing', async () => {
    const task = await reviewTask();
    const other = await loginAs('student');

    await acceptLikeTransaction(task);

    expect((await list(customer.cookie)).body.notifications).toEqual([]);
    expect((await list(other.cookie)).body.notifications).toEqual([]);
    expect(await prisma.notification.count()).toBe(1);
    expect(await prisma.notification.count({ where: { userId: student.user.id } })).toBe(1);
  });

  it('US-30 [mechanism] the function only writes the notification: the task, the escrow, the balances and the ledger are untouched', async () => {
    const task = await reviewTask();
    await prisma.escrow.create({ data: { taskId: task.id, customerId: customer.user.id, amountKopecks: 50_000, status: 'held', idempotencyKey: randomUUID() } });
    await prisma.balance.create({ data: { ownerId: customer.user.id, availableKopecks: 25_000 } });
    await prisma.ledgerEntry.create({ data: { ownerId: customer.user.id, kind: 'hold', amountKopecks: -50_000, taskId: task.id } });
    const snapshot = async () => ({
      task: await prisma.task.findUniqueOrThrow({ where: { id: task.id } }),
      escrow: await prisma.escrow.findUniqueOrThrow({ where: { taskId: task.id } }),
      balances: await prisma.balance.findMany({ orderBy: { ownerId: 'asc' } }),
      ledger: await prisma.ledgerEntry.findMany({ orderBy: { id: 'asc' } }),
      versions: await prisma.resultVersion.count(),
    });
    const before = await snapshot();

    await appPrisma.$transaction((tx) => notifyResultAccepted(tx, student.user.id, task)); // the function alone, nothing else

    expect(await snapshot()).toEqual(before);
    expect(before.task.status).toBe('in_review');
    expect(await prisma.notification.count()).toBe(1);
  });

  it('US-30 [mechanism] the notification and the status change commit together on one transaction', async () => {
    const task = await reviewTask();

    await acceptLikeTransaction(task);

    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe('done');
    expect(await prisma.notification.count()).toBe(1);
  });
});

describe('US-30 mechanism sc.2: nothing is sent when the transaction does not commit (the real accept is in accept-result.test.ts)', () => {
  it('US-30 sc.2 [mechanism] a failure after the notification rolls everything back: no notification, the task is still in_review', async () => {
    const task = await reviewTask();

    await expect(acceptLikeTransaction(task, { failAfter: true })).rejects.toThrow('injected failure');

    const row = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(row.status).toBe('in_review');
    expect(row.completedAt).toBeNull();
    expect(await prisma.notification.count()).toBe(0);
    expect((await list(student.cookie)).body.notifications).toEqual([]);
  });

  it('US-30 sc.2 [mechanism] a failure at the notification step itself leaves the task in_review and no notification', async () => {
    const task = await reviewTask();
    const restore = failNotificationInsert();
    try {
      await expect(acceptLikeTransaction(task)).rejects.toThrow('injected failure');
    } finally {
      restore();
    }

    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe('in_review');
    expect(await prisma.notification.count()).toBe(0);
  });

  it('US-30 sc.2 [mechanism] the function runs on the caller\'s transaction: calls that were made, then a failure of the caller, leave no row', async () => {
    const task = await reviewTask();

    // If the function opened a transaction of its own, its rows would commit before the caller fails. Both rows are gone, so they
    // were written on the caller's `tx`. (That the real accept fails the same way is for US-31.)
    await expect(
      appPrisma.$transaction(async (tx) => {
        await notifyResultAccepted(tx, student.user.id, task);
        await notifyResultAccepted(tx, student.user.id, task);
        throw new Error('caller failed');
      }),
    ).rejects.toThrow('caller failed');

    expect(await prisma.notification.count()).toBe(0);
  });
});

describe('US-30 sc.3: the student finds the notification later, among the unread ones', () => {
  it('US-30 sc.3 an old unread «результат прийнято» is listed, unread, with the exact text, when the student opens the centre later', async () => {
    const hoursAgo = new Date(Date.now() - 5 * 3600_000);
    await seedAccepted(student.user.id, { id: 'n-old', createdAt: hoursAgo });

    const res = await list(student.cookie);

    expect(res.status).toBe(200);
    expect(res.body.notifications).toHaveLength(1);
    expect(res.body.notifications[0]).toMatchObject({ id: 'n-old', type: 'result_accepted', text: TEXT, read: false, createdAt: hoursAgo.toISOString() });
  });

  it('US-30 sc.3 it is listed first, among the unread, even when more newer read notifications exist than the page limit', async () => {
    await seedAccepted(student.user.id, { id: 'n-0000', createdAt: new Date(Date.now() - 48 * 3600_000) });
    for (let i = 1; i <= 30; i += 1) {
      await seedAccepted(student.user.id, { id: `n-${String(100 + i)}`, type: 'executor_selected', readAt: new Date() });
    }

    const res = await list(student.cookie);

    expect(res.body.notifications[0]).toMatchObject({ id: 'n-0000', type: 'result_accepted', read: false });
    expect(res.body.notifications).toHaveLength(1 + 20);
  });

  it('US-30 sc.3 marking it read keeps it in the list as read; it is the student\'s own, another user gets 404', async () => {
    const mine = await seedAccepted(student.user.id);
    const stranger = await loginAs('student');

    expect((await markRead(mine.id, stranger.cookie)).status).toBe(404);
    expect((await markRead(mine.id, student.cookie)).status).toBe(204);

    const res = await list(student.cookie);
    expect(res.body.notifications).toHaveLength(1);
    expect(res.body.notifications[0]).toMatchObject({ id: mine.id, read: true, text: TEXT });
  });

  it('a notification whose payload is not of the expected shape gets the neutral text, not the story text', async () => {
    await seedAccepted(student.user.id, { payloadJson: JSON.stringify({ unexpected: true }) });

    const res = await list(student.cookie);

    expect(res.body.notifications[0]).toMatchObject({ type: 'result_accepted', text: 'Нове сповіщення' });
  });
});

describe('US-30 the link target: the executor card of a task that is done', () => {
  it('US-30 the executor still reads a task that is done and its result, which is where «Ваш результат прийнято…» links to', async () => {
    const task = await createTask(customer.user.id, { status: 'done', executorId: student.user.id, publishedAt: new Date(), assignedAt: new Date(), completedAt: new Date() });
    const version = await prisma.resultVersion.create({ data: { taskId: task.id, version: 1, status: 'accepted', submittedAt: new Date() } });
    const file = await prisma.file.create({
      data: { ownerId: student.user.id, kind: 'result', storageKey: randomUUID(), originalName: 'a.pdf', mime: 'application/pdf', sizeBytes: 10, sha256: 'h' },
    });
    await prisma.resultFile.create({ data: { resultVersionId: version.id, fileId: file.id } });

    const details = await api().get(`/api/tasks/${task.id}`).set('Cookie', student.cookie);
    const result = await api().get(`/api/tasks/${task.id}/result`).set('Cookie', student.cookie);

    expect(details.status).toBe(200);
    expect(details.body.task).toMatchObject({ id: task.id, status: 'done' });
    expect(result.status).toBe(200);
    expect(result.body.result).toMatchObject({ version: 1, status: 'accepted' });
    expect(result.body.result.files).toHaveLength(1);
  });
});
