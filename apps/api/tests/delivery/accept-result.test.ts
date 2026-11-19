import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { LIMITS } from '@ctoc/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hashSessionId } from '../../src/modules/identity/domain';
import { payoutSplitOf } from '../../src/modules/payments/domain';
import { prisma as appPrisma } from '../../src/platform/db';
import { getFileStorage } from '../../src/platform/ports/file-storage';
import { seedWorkData } from '../../src/seed/dev-work';
import { api } from '../helpers/app';
import { prisma, resetDb } from '../helpers/db';
import { createTask } from '../helpers/factories';

/**
 * US-31 (accept), with the parts of US-30, US-34 and US-37 that the accept transaction does (INV-18): the notification to the
 * student, the escrow release with the payout and the commission, and the creation of the experience record. These tests go
 * through the real endpoint `POST /api/tasks/:id/accept`.
 */

const ORIGIN = 'http://localhost:5173';
const UPLOAD_DIR = resolve(process.cwd(), 'data/test-uploads');
const PRICE = 50_000;
const COMMISSION = 5_000; // 10 %
const NET = 45_000;
const TEXT = 'Ваш результат прийнято замовником! Оплату нараховано';

let counter = 0;
async function loginAs(role: 'student' | 'customer') {
  counter += 1;
  const user = await prisma.user.create({
    data: {
      email: `accept${counter}@${role === 'student' ? 'university.edu.ua' : 'company.com'}`,
      passwordHash: 'x',
      displayName: 'Користувач',
      role,
      emailConfirmedAt: new Date(),
      studentVerifiedAt: role === 'student' ? new Date() : null,
    },
  });
  const sid = `accept-session-${counter}`;
  await prisma.session.create({ data: { id: hashSessionId(sid), userId: user.id, expiresAt: new Date(Date.now() + 3600_000) } });
  return { user, cookie: `sid=${sid}` };
}

const accept = (taskId: string, cookie?: string) => {
  const req = api().post(`/api/tasks/${taskId}/accept`);
  return cookie ? req.set('Cookie', cookie).set('Origin', ORIGIN) : req;
};
const notificationsOf = (cookie: string) => api().get('/api/me/notifications').set('Cookie', cookie);
const balanceOf = (cookie: string) => api().get('/api/me/balance').set('Cookie', cookie);
const readResult = (taskId: string, cookie: string) => api().get(`/api/tasks/${taskId}/result`).set('Cookie', cookie);
const download = (fileId: string, cookie: string) => api().get(`/api/files/${fileId}`).set('Cookie', cookie);

let customer: Awaited<ReturnType<typeof loginAs>>;
let student: Awaited<ReturnType<typeof loginAs>>;

/**
 * A task under review, as the real flow leaves it: the escrow held for the price, the customer's balance and ledger consistent
 * with that hold, the price split taken at publication, and a submitted version with one file whose bytes are in the storage.
 */
async function reviewTask(options: { commission?: number | null; net?: number | null; escrow?: boolean; taskStatus?: string; versionStatus?: string | null } = {}) {
  const hasSplit = options.commission !== null && options.net !== null;
  const task = await createTask(customer.user.id, {
    status: options.taskStatus ?? 'in_review',
    executorId: student.user.id,
    publishedAt: new Date(),
    assignedAt: new Date(),
    priceKopecks: PRICE,
    commissionBp: hasSplit ? 1000 : null,
    commissionKopecks: hasSplit ? (options.commission ?? COMMISSION) : null,
    netKopecks: hasSplit ? (options.net ?? NET) : null,
  });
  if (options.escrow !== false) {
    await prisma.escrow.create({ data: { taskId: task.id, customerId: customer.user.id, amountKopecks: PRICE, status: 'held', idempotencyKey: randomUUID() } });
    await prisma.balance.upsert({ where: { ownerId: customer.user.id }, create: { ownerId: customer.user.id, availableKopecks: 0 }, update: {} });
    await prisma.ledgerEntry.createMany({
      data: [
        { ownerId: customer.user.id, kind: 'topup', amountKopecks: PRICE },
        { ownerId: customer.user.id, kind: 'hold', amountKopecks: -PRICE, taskId: task.id },
      ],
    });
  }
  let fileId: string | null = null;
  let versionId: string | null = null;
  if (options.versionStatus !== null) {
    const version = await prisma.resultVersion.create({ data: { taskId: task.id, version: 1, status: options.versionStatus ?? 'submitted', submittedAt: new Date() } });
    versionId = version.id;
    const storageKey = randomUUID();
    await getFileStorage().put(storageKey, Buffer.from('%PDF-1.4\nthe result of the student'));
    const file = await prisma.file.create({
      data: { ownerId: student.user.id, kind: 'result', storageKey, originalName: 'result.pdf', mime: 'application/pdf', sizeBytes: 30, sha256: 'h' },
    });
    await prisma.resultFile.create({ data: { resultVersionId: version.id, fileId: file.id } });
    fileId = file.id;
  }
  return { task, fileId, versionId };
}

/** Everything the accept can change. Two equal snapshots mean that nothing changed. */
const snapshot = async () => ({
  tasks: await prisma.task.findMany({ orderBy: { id: 'asc' } }),
  versions: await prisma.resultVersion.findMany({ orderBy: { id: 'asc' } }),
  escrows: await prisma.escrow.findMany({ orderBy: { id: 'asc' } }),
  balances: await prisma.balance.findMany({ orderBy: { ownerId: 'asc' } }),
  ledger: await prisma.ledgerEntry.findMany({ orderBy: { id: 'asc' } }),
  experience: await prisma.experienceRecord.count(),
  notifications: await prisma.notification.count(),
});

/** INV-20: every balance equals the sum of its ledger entries, none is negative, and every owner with entries has a balance. */
async function expectBalancesToEqualLedger() {
  const balances = await prisma.balance.findMany();
  const entries = await prisma.ledgerEntry.findMany();
  const sums = new Map<string, number>();
  for (const entry of entries) sums.set(entry.ownerId, (sums.get(entry.ownerId) ?? 0) + entry.amountKopecks);
  for (const balance of balances) {
    expect(balance.availableKopecks, `balance of ${balance.ownerId}`).toBe(sums.get(balance.ownerId) ?? 0);
    expect(balance.availableKopecks).toBeGreaterThanOrEqual(0);
  }
  for (const owner of sums.keys()) expect(balances.some((balance) => balance.ownerId === owner), `balance row of ${owner}`).toBe(true);
}

/** The hook of the fault-injection scenarios (W-08): one method of one model throws inside the transaction. */
function failOn(model: string, method: string, nth = 1) {
  const original = appPrisma.$transaction;
  appPrisma.$transaction = ((fn: (tx: object) => unknown, options?: unknown) => {
    let calls = 0; // counted per transaction: `nth` picks the 1st, 2nd... call of this method inside the accept
    return (original as (...a: unknown[]) => unknown).call(
      appPrisma,
      (tx: object) =>
        fn(
          new Proxy(tx, {
            get(target, prop) {
              const value = Reflect.get(target, prop, target) as object;
              if (prop !== model) return value;
              return new Proxy(value, {
                get(delegate, name) {
                  const member = Reflect.get(delegate, name, delegate);
                  if (name !== method) return member;
                  return (...args: unknown[]) => {
                    calls += 1;
                    if (calls === nth) return Promise.reject(new Error('injected failure'));
                    return (member as (...a: unknown[]) => unknown).apply(delegate, args);
                  };
                },
              });
            },
          }),
        ),
      options,
    );
  }) as never;
  return () => {
    appPrisma.$transaction = original;
  };
}

beforeEach(async () => {
  await resetDb();
  rmSync(UPLOAD_DIR, { recursive: true, force: true });
  customer = await loginAs('customer');
  student = await loginAs('student');
});

afterEach(() => vi.restoreAllMocks());

describe('Accept the result: US-31 sc.1', () => {
  it('US-31 sc.1 the owner accepts: 200, task done with the time, version accepted, escrow released', async () => {
    const { task, versionId } = await reviewTask();

    const res = await accept(task.id, customer.cookie);

    expect(res.status).toBe(200);
    expect(res.body.task).toMatchObject({ id: task.id, status: 'done' });
    expect(res.body.task.completedAt).toEqual(expect.any(String));
    expect(res.body.payout).toEqual({ grossKopecks: PRICE, commissionKopecks: COMMISSION, netKopecks: NET });
    expect(res.body.experienceRecordId).toEqual(expect.any(String));
    const row = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(row.status).toBe('done');
    expect(row.completedAt).not.toBeNull();
    const version = await prisma.resultVersion.findUniqueOrThrow({ where: { id: versionId! } });
    expect(version.status).toBe('accepted');
    expect(version.decidedAt).not.toBeNull();
    const escrow = await prisma.escrow.findUniqueOrThrow({ where: { taskId: task.id } });
    expect(escrow.status).toBe('released');
    expect(escrow.settledAt).not.toBeNull();
  });

  it('US-31 sc.1 a request body is ignored: nothing in it can set an amount, a status or an executor', async () => {
    const { task } = await reviewTask();

    const res = await accept(task.id, customer.cookie).send({ status: 'cancelled', netKopecks: 1, executorId: customer.user.id, priceKopecks: 1 });

    expect(res.status).toBe(200);
    expect(res.body.payout).toEqual({ grossKopecks: PRICE, commissionKopecks: COMMISSION, netKopecks: NET });
    expect(await prisma.balance.findUniqueOrThrow({ where: { ownerId: student.user.id } })).toMatchObject({ availableKopecks: NET });
  });

  it('US-31 after the accept the files are fixed and the chat is read-only: no upload, no delete, no message', async () => {
    const { task, fileId } = await reviewTask();
    await accept(task.id, customer.cookie);

    const upload = await api()
      .post(`/api/tasks/${task.id}/result/files`)
      .set('Cookie', student.cookie)
      .set('Origin', ORIGIN)
      .attach('file', Buffer.from('%PDF-1.4\nlate'), { filename: 'late.pdf', contentType: 'application/pdf' });
    const removal = await api().delete(`/api/tasks/${task.id}/result/files/${fileId}`).set('Cookie', student.cookie).set('Origin', ORIGIN);
    const message = await api().post(`/api/tasks/${task.id}/messages`).set('Cookie', customer.cookie).set('Origin', ORIGIN).send({ body: 'Дякую' });

    expect(upload.body.error.code).toBe('INVALID_TRANSITION');
    expect(removal.body.error.code).toBe('INVALID_TRANSITION');
    expect(message.body.error.code).toBe('CHAT_CLOSED');
  });
});

describe('The money of the accept (US-34 sc.1, INV-20)', () => {
  it('US-34 sc.1 the student is credited the net amount and the platform the commission; the three entries of the task add up to nothing', async () => {
    const { task } = await reviewTask();

    await accept(task.id, customer.cookie);

    expect(await prisma.balance.findUniqueOrThrow({ where: { ownerId: student.user.id } })).toMatchObject({ availableKopecks: NET });
    expect(await prisma.balance.findUniqueOrThrow({ where: { ownerId: 'platform' } })).toMatchObject({ availableKopecks: COMMISSION });
    expect(await prisma.balance.findUniqueOrThrow({ where: { ownerId: customer.user.id } })).toMatchObject({ availableKopecks: 0 }); // paid at the hold, nothing more
    const entries = await prisma.ledgerEntry.findMany({ where: { taskId: task.id }, orderBy: { kind: 'asc' } });
    expect(entries.map((entry) => [entry.ownerId, entry.kind, entry.amountKopecks])).toEqual([
      ['platform', 'commission', COMMISSION],
      [customer.user.id, 'hold', -PRICE],
      [student.user.id, 'payout', NET],
    ]);
    expect(entries.reduce((total, entry) => total + entry.amountKopecks, 0)).toBe(0); // no money appears or disappears
    await expectBalancesToEqualLedger();
  });

  it('US-34 sc.1 the amount is available to the student: GET /api/me/balance shows it', async () => {
    const { task } = await reviewTask();
    await accept(task.id, customer.cookie);

    const res = await balanceOf(student.cookie);

    expect(res.status).toBe(200);
    expect(res.body.balance.availableKopecks).toBe(NET);
  });

  it('a commission of 0 pays the student the whole price and writes no commission entry (a ledger entry cannot be 0)', async () => {
    const { task } = await reviewTask({ commission: 0, net: PRICE });

    const res = await accept(task.id, customer.cookie);

    expect(res.status).toBe(200);
    expect(res.body.payout).toEqual({ grossKopecks: PRICE, commissionKopecks: 0, netKopecks: PRICE });
    expect(await prisma.ledgerEntry.count({ where: { taskId: task.id, kind: 'commission' } })).toBe(0);
    expect(await prisma.balance.findUnique({ where: { ownerId: 'platform' } })).toBeNull();
    expect(await prisma.balance.findUniqueOrThrow({ where: { ownerId: student.user.id } })).toMatchObject({ availableKopecks: PRICE });
    await expectBalancesToEqualLedger();
  });

  it('a second student paid for a second task has their own balance, the platform collects both commissions', async () => {
    const first = await reviewTask();
    const other = await loginAs('student');
    const second = await createTask(customer.user.id, {
      status: 'in_review', executorId: other.user.id, publishedAt: new Date(), assignedAt: new Date(),
      priceKopecks: PRICE, commissionBp: 1000, commissionKopecks: COMMISSION, netKopecks: NET,
    });
    await prisma.escrow.create({ data: { taskId: second.id, customerId: customer.user.id, amountKopecks: PRICE, status: 'held', idempotencyKey: randomUUID() } });
    await prisma.ledgerEntry.createMany({ data: [{ ownerId: customer.user.id, kind: 'topup', amountKopecks: PRICE }, { ownerId: customer.user.id, kind: 'hold', amountKopecks: -PRICE, taskId: second.id }] });
    await prisma.resultVersion.create({ data: { taskId: second.id, version: 1, status: 'submitted', submittedAt: new Date() } });

    expect((await accept(first.task.id, customer.cookie)).status).toBe(200);
    expect((await accept(second.id, customer.cookie)).status).toBe(200);

    expect(await prisma.balance.findUniqueOrThrow({ where: { ownerId: student.user.id } })).toMatchObject({ availableKopecks: NET });
    expect(await prisma.balance.findUniqueOrThrow({ where: { ownerId: other.user.id } })).toMatchObject({ availableKopecks: NET });
    expect(await prisma.balance.findUniqueOrThrow({ where: { ownerId: 'platform' } })).toMatchObject({ availableKopecks: 2 * COMMISSION });
    await expectBalancesToEqualLedger();
  });
});

describe('The experience record of the accept (US-37, creation only)', () => {
  it('US-37 the record has the title and the description of the task, the student, and the time the task was completed', async () => {
    const { task } = await reviewTask();

    const res = await accept(task.id, customer.cookie);

    const record = await prisma.experienceRecord.findUniqueOrThrow({ where: { taskId: task.id } });
    expect(res.body.experienceRecordId).toBe(record.id);
    expect(record).toMatchObject({ studentId: student.user.id, title: task.title, description: task.description });
    expect(record.completedAt.getTime()).toBe((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).completedAt!.getTime());
    expect(await prisma.experienceRecord.count()).toBe(1);
  });

  it('INV-21 the record of the accept is the one the public profile shows (US-37 sc.1; the full list is in tests/experience)', async () => {
    const { task } = await reviewTask();
    const res = await accept(task.id, customer.cookie);

    const profile = await api().get(`/api/profiles/${student.user.id}`).set('Cookie', customer.cookie);

    expect(profile.status).toBe(200);
    expect(profile.body.profile.experience).toEqual([expect.objectContaining({ id: res.body.experienceRecordId, title: task.title, confirmedBy: 'platform' })]);
  });
});

describe('US-30 through the real accept', () => {
  it('US-30 sc.1 the student gets «Ваш результат прийнято замовником! Оплату нараховано», unread, in the same transaction as the payout', async () => {
    const { task } = await reviewTask();

    await accept(task.id, customer.cookie);

    const res = await notificationsOf(student.cookie);
    expect(res.status).toBe(200);
    expect(res.body.notifications).toHaveLength(1);
    expect(res.body.notifications[0]).toMatchObject({ type: 'result_accepted', text: TEXT, read: false, payload: { taskId: task.id, taskTitle: task.title } });
    // «Оплату нараховано» is true: the payout is there when the student reads it.
    expect((await balanceOf(student.cookie)).body.balance.availableKopecks).toBe(NET);
    expect((await notificationsOf(customer.cookie)).body.notifications).toEqual([]); // only the student is told
  });

  it('US-30 sc.3 a student who was away finds the notification later, unread, even behind many newer read ones', async () => {
    const { task } = await reviewTask();
    await accept(task.id, customer.cookie);
    for (let i = 1; i <= 30; i += 1) {
      await prisma.notification.create({ data: { id: `z-${String(100 + i)}`, userId: student.user.id, type: 'executor_selected', payloadJson: '{}', readAt: new Date() } });
    }

    const res = await notificationsOf(student.cookie);

    expect(res.body.notifications[0]).toMatchObject({ type: 'result_accepted', text: TEXT, read: false });
  });

  it('US-30 sc.2 a failure at the notification step is 500 INTERNAL_ERROR: the task stays in_review, nothing is paid, no notification', async () => {
    const { task } = await reviewTask();
    const before = await snapshot();
    const restore = failOn('notification', 'create');
    let res;
    try {
      res = await accept(task.id, customer.cookie);
    } finally {
      restore();
    }

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(await snapshot()).toEqual(before);
    expect((await notificationsOf(student.cookie)).body.notifications).toEqual([]);
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe('in_review');
  });
});

describe('Atomicity: a failure at any step undoes the whole accept (INV-18, US-34 sc.2)', () => {
  // The n-th call of a method inside the accept is failed. Each step, in the order of the transaction, is named by its call:
  // the student is credited first, then the platform, so the second balance write and the second ledger entry are the
  // platform's, and they come AFTER the student is already credited: the partial write that matters most.
  it.each([
    ['the task (the first write, the lock)', 'task', 'updateMany', 1],
    ['the version', 'resultVersion', 'updateMany', 1],
    ['the escrow release (the provider)', 'escrow', 'updateMany', 1],
    ['the balance row of the student', 'balance', 'upsert', 1],
    ['the credit of the student (after the escrow is released)', 'balance', 'updateMany', 1],
    ['the payout entry of the student', 'ledgerEntry', 'create', 1],
    ['the balance row of the platform (after the student is credited)', 'balance', 'upsert', 2],
    ['the credit of the platform (after the student is credited)', 'balance', 'updateMany', 2],
    ['the commission entry (after the student is credited)', 'ledgerEntry', 'create', 2],
    ['the experience record', 'experienceRecord', 'create', 1],
    ['the notification (the last step)', 'notification', 'create', 1],
  ])('US-34 sc.2 a failure at %s: 500, and the task, version, escrow, balances, ledger, record and notifications are as they were', async (_step, model, method, nth) => {
    const { task } = await reviewTask();
    const before = await snapshot();
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const restore = failOn(model, method, nth);
    let res;
    try {
      res = await accept(task.id, customer.cookie);
    } finally {
      restore();
    }

    expect(res.status).toBe(500); // the hook was reached: the step really ran inside the transaction
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(res.body.error.message).not.toContain('injected'); // no internals leak (ADR-0005)
    expect(await snapshot()).toEqual(before);
    expect((await prisma.escrow.findUniqueOrThrow({ where: { taskId: task.id } })).status).toBe('held'); // the money stays in the escrow
    // The error is logged (US-34 sc.2): by the central handler, with the error itself, not just any log line.
    expect(logged).toHaveBeenCalledWith('Unhandled error', expect.objectContaining({ message: 'injected failure' }));
    await expectBalancesToEqualLedger();
    // And the accept still works afterwards: nothing was left half done.
    expect((await accept(task.id, customer.cookie)).status).toBe(200);
  });

  it('a credit that would pass the balance limit is refused like a broken invariant: 500, logged by the accept, and nothing is paid (the student)', async () => {
    const { task } = await reviewTask();
    await prisma.balance.upsert({ where: { ownerId: student.user.id }, create: { ownerId: student.user.id, availableKopecks: LIMITS.balanceMaxKopecks - 1 }, update: {} });
    const before = await snapshot();
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const res = await accept(task.id, customer.cookie);

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(logged).toHaveBeenCalledWith(expect.stringContaining('would pass the balance limit'));
    expect(await snapshot()).toEqual(before);
    expect((await prisma.escrow.findUniqueOrThrow({ where: { taskId: task.id } })).status).toBe('held');
  });

  it('the platform balance has the same limit: if its credit would pass it, the accept is refused after the student was credited, and everything is rolled back', async () => {
    const { task } = await reviewTask();
    await prisma.balance.upsert({ where: { ownerId: 'platform' }, create: { ownerId: 'platform', availableKopecks: LIMITS.balanceMaxKopecks - 1 }, update: {} });
    const before = await snapshot();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const res = await accept(task.id, customer.cookie);

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(await snapshot()).toEqual(before); // the student's credit, already made in the transaction, is gone too
    expect(await prisma.balance.findUnique({ where: { ownerId: student.user.id } })).toBeNull();
  });
});

describe('Refusals change nothing', () => {
  it('US-31 sc.2 anyone but the owner is 403 NOT_TASK_OWNER: another customer, the executor, another student; no session is 401', async () => {
    const { task } = await reviewTask();
    const otherCustomer = await loginAs('customer');
    const stranger = await loginAs('student');
    const before = await snapshot();

    for (const who of [otherCustomer, student, stranger]) {
      const res = await accept(task.id, who.cookie);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('NOT_TASK_OWNER');
    }
    expect((await accept(task.id)).status).toBe(401);
    expect(await snapshot()).toEqual(before);
  });

  it('an unknown task is 404 NOT_FOUND', async () => {
    const res = await accept('00000000-0000-4000-8000-000000000000', customer.cookie);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it.each(['in_progress', 'revision', 'published', 'cancelled'])('a task in %s has no result under review: 409 TASK_NOT_IN_REVIEW', async (status) => {
    const { task } = await reviewTask({ taskStatus: status, versionStatus: status === 'revision' ? 'returned' : 'draft' });
    const before = await snapshot();

    const res = await accept(task.id, customer.cookie);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TASK_NOT_IN_REVIEW');
    expect(await snapshot()).toEqual(before);
  });

  it('a task without a price split (OQ-22) is not accepted and not recomputed: 500, logged, nothing changes', async () => {
    const { task } = await reviewTask({ commission: null, net: null });
    const before = await snapshot();
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const res = await accept(task.id, customer.cookie);

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(logged).toHaveBeenCalledWith(expect.stringContaining(task.id));
    expect(await snapshot()).toEqual(before);
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe('in_review');
  });

  it('INV-08 the database does not allow a split that does not add up to the price, so no such task can reach the accept', async () => {
    await expect(reviewTask({ commission: 1_000, net: 1_000 })).rejects.toThrow(/tasks_commission_sum_check|CHECK constraint/);
  });

  it('payoutSplitOf is the second guard: no split, a negative commission, a zero net or a sum that is not the price give null; a good one is returned as it is', () => {
    expect(payoutSplitOf({ priceKopecks: PRICE, commissionKopecks: null, netKopecks: null })).toBeNull();
    expect(payoutSplitOf({ priceKopecks: PRICE, commissionKopecks: -1, netKopecks: PRICE + 1 })).toBeNull();
    expect(payoutSplitOf({ priceKopecks: PRICE, commissionKopecks: PRICE, netKopecks: 0 })).toBeNull();
    expect(payoutSplitOf({ priceKopecks: PRICE, commissionKopecks: 1_000, netKopecks: 1_000 })).toBeNull();
    expect(payoutSplitOf({ priceKopecks: PRICE, commissionKopecks: COMMISSION, netKopecks: NET })).toEqual({ grossKopecks: PRICE, commissionKopecks: COMMISSION, netKopecks: NET });
    expect(payoutSplitOf({ priceKopecks: PRICE, commissionKopecks: 0, netKopecks: PRICE })).toEqual({ grossKopecks: PRICE, commissionKopecks: 0, netKopecks: PRICE });
  });

  it('a task under review without a held escrow is a broken invariant: 500, logged, nothing changes', async () => {
    const { task } = await reviewTask({ escrow: false });
    const before = await snapshot();
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const res = await accept(task.id, customer.cookie);

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(logged).toHaveBeenCalled();
    expect(await snapshot()).toEqual(before);
  });

  it('a task in review without a submitted version is a broken invariant: 500, logged, nothing changes', async () => {
    const { task } = await reviewTask({ versionStatus: null });
    const before = await snapshot();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const res = await accept(task.id, customer.cookie);

    expect(res.status).toBe(500);
    expect(await snapshot()).toEqual(before);
  });
});

describe('A repeated accept (US-31 sc.3, US-34 sc.3, INV-19, INV-21)', () => {
  it('US-31 sc.3 the second accept is 409 TASK_ALREADY_DONE and changes nothing: one payout, one commission, one record, one notification', async () => {
    const { task } = await reviewTask();
    expect((await accept(task.id, customer.cookie)).status).toBe(200);
    const afterFirst = await snapshot();

    const again = await accept(task.id, customer.cookie);

    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('TASK_ALREADY_DONE');
    expect(await snapshot()).toEqual(afterFirst);
    expect(await prisma.ledgerEntry.count({ where: { taskId: task.id, kind: 'payout' } })).toBe(1);
    expect(await prisma.ledgerEntry.count({ where: { taskId: task.id, kind: 'commission' } })).toBe(1);
    expect(await prisma.experienceRecord.count({ where: { taskId: task.id } })).toBe(1);
    expect(await prisma.notification.count({ where: { type: 'result_accepted' } })).toBe(1);
    await expectBalancesToEqualLedger();
  });

  it('US-34 sc.3 a duplicate accept does not pay twice: the student keeps exactly the net amount', async () => {
    const { task } = await reviewTask();
    await accept(task.id, customer.cookie);
    await accept(task.id, customer.cookie);
    await accept(task.id, customer.cookie);

    expect((await balanceOf(student.cookie)).body.balance.availableKopecks).toBe(NET);
  });

  it('several accepts at the same time: exactly one 200, the others 409 TASK_ALREADY_DONE, and only one of everything is written', async () => {
    const { task } = await reviewTask();

    const results = await Promise.all(Array.from({ length: 5 }, () => accept(task.id, customer.cookie)));

    expect(results.filter((res) => res.status === 200)).toHaveLength(1);
    const refused = results.filter((res) => res.status !== 200);
    expect(refused).toHaveLength(4);
    expect(refused.every((res) => res.status === 409 && res.body.error.code === 'TASK_ALREADY_DONE')).toBe(true);
    expect(await prisma.ledgerEntry.count({ where: { taskId: task.id, kind: 'payout' } })).toBe(1);
    expect(await prisma.ledgerEntry.count({ where: { taskId: task.id, kind: 'commission' } })).toBe(1);
    expect(await prisma.experienceRecord.count()).toBe(1);
    expect(await prisma.notification.count({ where: { type: 'result_accepted' } })).toBe(1);
    expect(await prisma.balance.findUniqueOrThrow({ where: { ownerId: student.user.id } })).toMatchObject({ availableKopecks: NET });
    expect(await prisma.balance.findUniqueOrThrow({ where: { ownerId: 'platform' } })).toMatchObject({ availableKopecks: COMMISSION });
    await expectBalancesToEqualLedger();
  });

  it('the database itself refuses a second payout, commission or record for a task (the unique indexes)', async () => {
    const { task } = await reviewTask();
    await accept(task.id, customer.cookie);

    await expect(prisma.ledgerEntry.create({ data: { ownerId: student.user.id, kind: 'payout', amountKopecks: 1, taskId: task.id } })).rejects.toThrow();
    await expect(prisma.ledgerEntry.create({ data: { ownerId: 'platform', kind: 'commission', amountKopecks: 1, taskId: task.id } })).rejects.toThrow();
    await expect(prisma.experienceRecord.create({ data: { studentId: student.user.id, taskId: task.id, title: 't', description: 'd', completedAt: new Date() } })).rejects.toThrow();
    expect(await prisma.escrow.count({ where: { taskId: task.id } })).toBe(1);
  });
});

describe('The customer sees the result, but never a draft (US-31)', () => {
  it('US-31 the owner reads the version that was sent for review, with its files, and downloads a file byte for byte', async () => {
    const { task, fileId } = await reviewTask();

    const result = await readResult(task.id, customer.cookie);
    const file = await download(fileId!, customer.cookie);

    expect(result.status).toBe(200);
    expect(result.body.result).toMatchObject({ version: 1, status: 'submitted' });
    expect(result.body.result.files.map((f: { id: string }) => f.id)).toEqual([fileId]);
    expect(file.status).toBe(200);
    expect(file.headers['content-disposition']).toMatch(/^attachment;/);
    expect(Buffer.from(file.body as Buffer).toString()).toContain('the result of the student');
  });

  it('US-31 the owner still reads and downloads the accepted result after the accept', async () => {
    const { task, fileId } = await reviewTask();
    await accept(task.id, customer.cookie);

    expect((await readResult(task.id, customer.cookie)).body.result).toMatchObject({ status: 'accepted' });
    expect((await download(fileId!, customer.cookie)).status).toBe(200);
  });

  it('INV-16 a draft is not shown to the owner: the result is null and its file is 403 FILE_FORBIDDEN, while the executor sees both', async () => {
    const { task, fileId } = await reviewTask({ taskStatus: 'in_progress', versionStatus: 'draft' });

    const asOwner = await readResult(task.id, customer.cookie);
    const fileAsOwner = await download(fileId!, customer.cookie);

    expect(asOwner.body).toEqual({ result: null });
    expect(fileAsOwner.status).toBe(403);
    expect(fileAsOwner.body.error.code).toBe('FILE_FORBIDDEN');
    expect((await readResult(task.id, student.cookie)).body.result.files).toHaveLength(1);
    expect((await download(fileId!, student.cookie)).status).toBe(200);
  });

  it('the owner of another task and another student cannot read or download it: 403', async () => {
    const { task, fileId } = await reviewTask();
    const otherCustomer = await loginAs('customer');
    const stranger = await loginAs('student');

    for (const who of [otherCustomer, stranger]) {
      expect((await readResult(task.id, who.cookie)).status).toBe(403);
      const file = await download(fileId!, who.cookie);
      expect(file.status).toBe(403);
      expect(file.body.error.code).toBe('FILE_FORBIDDEN');
    }
  });

  it('a file the executor deleted from a draft is gone for the owner too: 404', async () => {
    const { task, fileId } = await reviewTask({ taskStatus: 'in_progress', versionStatus: 'draft' });
    await api().delete(`/api/tasks/${task.id}/result/files/${fileId}`).set('Cookie', student.cookie).set('Origin', ORIGIN);

    expect((await download(fileId!, customer.cookie)).status).toBe(404);
    expect((await download(fileId!, student.cookie)).status).toBe(404);
  });
});

describe('Integration: the whole real chain, from the seeded assignment to the accept (US-30, US-31, US-34, US-37)', () => {
  it('assign (US-25, escrow held) -> upload -> submit -> accept: the student is paid, told and has a record; every balance equals its ledger', async () => {
    const passwords = { student: `s-${randomUUID()}`, customer: `c-${randomUUID()}` };
    const seeded = await seedWorkData(prisma, passwords); // the real services: top-up, task, application, assign with the escrow
    const loginCookie = async (email: string, password: string) => {
      const res = await api().post('/api/auth/login').set('Origin', ORIGIN).send({ email, password });
      expect(res.status).toBe(200);
      return String(res.headers['set-cookie']?.[0]).split(';')[0]!;
    };
    const studentCookie = await loginCookie('seed.student@ctoc.local', passwords.student);
    const customerCookie = await loginCookie('seed.customer@ctoc.local', passwords.customer);
    const taskId = seeded.taskId!;

    const up = await api().post(`/api/tasks/${taskId}/result/files`).set('Cookie', studentCookie).set('Origin', ORIGIN).attach('file', Buffer.from('%PDF-1.4\nreal'), { filename: 'a.pdf', contentType: 'application/pdf' });
    expect(up.status).toBe(201);
    expect((await api().post(`/api/tasks/${taskId}/result/submit`).set('Cookie', studentCookie).set('Origin', ORIGIN)).status).toBe(200);
    const fileId = up.body.result.files[0].id as string;
    expect((await download(fileId, customerCookie)).status).toBe(200); // the owner can look at it before deciding

    const res = await accept(taskId, customerCookie);

    expect(res.status).toBe(200);
    expect(res.body.task.status).toBe('done');
    expect(res.body.payout).toEqual({ grossKopecks: PRICE, commissionKopecks: COMMISSION, netKopecks: NET });
    const notes = await notificationsOf(studentCookie);
    expect(notes.body.notifications.find((n: { type: string }) => n.type === 'result_accepted')).toMatchObject({ text: TEXT, read: false });
    expect((await balanceOf(studentCookie)).body.balance.availableKopecks).toBe(NET);
    expect((await api().get('/api/me/work').set('Cookie', studentCookie)).body.tasks[0]).toMatchObject({ id: taskId, status: 'done' });
    expect(await prisma.experienceRecord.count({ where: { taskId } })).toBe(1);
    expect((await prisma.escrow.findUniqueOrThrow({ where: { taskId } })).status).toBe('released');
    const entries = await prisma.ledgerEntry.findMany({ where: { taskId } });
    expect(entries.map((entry) => entry.kind).sort()).toEqual(['commission', 'hold', 'payout']);
    expect(entries.reduce((total, entry) => total + entry.amountKopecks, 0)).toBe(0);
    await expectBalancesToEqualLedger();
    expect((await accept(taskId, customerCookie)).body.error.code).toBe('TASK_ALREADY_DONE');
  });
});
