import { randomUUID } from 'node:crypto';
import { LIMITS } from '@ctoc/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { hashSessionId } from '../../src/modules/identity/domain';
import { prisma as appPrisma } from '../../src/platform/db';
import { api } from '../helpers/app';
import { prisma, resetDb } from '../helpers/db';
import { createTask } from '../helpers/factories';

/**
 * US-36 (withdraw to a Ukrainian bank card): `POST /api/me/withdrawals` and `GET /api/me/withdrawals`, api.md §4.1c.
 * The money a student withdraws was earned through the real accept (US-31, US-34), so every balance here is backed by its
 * ledger entries (INV-20). The card is checked for 16 digits and Luhn only: the issuer is not detected (W-13, OQ-13).
 */

const ORIGIN = 'http://localhost:5173';
const CARD = '4111 1111 1111 1111';
const CARD_DIGITS = '4111111111111111';

let counter = 0;
async function loginAs(role: 'student' | 'customer' | 'moderator', overrides: Record<string, unknown> = {}) {
  counter += 1;
  const user = await prisma.user.create({
    data: {
      email: `withdraw${counter}@${role === 'student' ? 'university.edu.ua' : 'company.com'}`,
      passwordHash: 'x',
      displayName: `Користувач ${counter}`,
      role,
      emailConfirmedAt: new Date(),
      studentVerifiedAt: role === 'student' ? new Date() : null,
      ...overrides,
    },
  });
  const sid = `withdraw-session-${counter}`;
  await prisma.session.create({ data: { id: hashSessionId(sid), userId: user.id, expiresAt: new Date(Date.now() + 3600_000) } });
  return { user, cookie: `sid=${sid}` };
}

type Login = Awaited<ReturnType<typeof loginAs>>;

const withdraw = (body: unknown, cookie?: string) => {
  const req = api().post('/api/me/withdrawals');
  return (cookie ? req.set('Cookie', cookie).set('Origin', ORIGIN) : req.set('Origin', ORIGIN)).send(body as object);
};
const myWithdrawals = (cookie?: string) => {
  const req = api().get('/api/me/withdrawals');
  return cookie ? req.set('Cookie', cookie) : req;
};
const balanceOf = async (ownerId: string) => (await prisma.balance.findUnique({ where: { ownerId } }))?.availableKopecks ?? 0;
const ledgerSum = async (ownerId: string) =>
  (await prisma.ledgerEntry.aggregate({ where: { ownerId }, _sum: { amountKopecks: true } }))._sum.amountKopecks ?? 0;

let customer: Login;
let student: Login;

/**
 * The student earns `net` through the real accept: a task under review as the flow leaves it (price held, split snapshotted,
 * a submitted version), then the customer accepts. Commission 0, so the student is credited the whole price (OQ-39 b).
 */
async function earn(executor: Login, netKopecks: number) {
  const task = await createTask(customer.user.id, {
    status: 'in_review',
    executorId: executor.user.id,
    publishedAt: new Date(),
    assignedAt: new Date(),
    priceKopecks: netKopecks,
    commissionBp: 0,
    commissionKopecks: 0,
    netKopecks,
  });
  await prisma.escrow.create({ data: { taskId: task.id, customerId: customer.user.id, amountKopecks: netKopecks, status: 'held', idempotencyKey: randomUUID() } });
  await prisma.balance.upsert({ where: { ownerId: customer.user.id }, create: { ownerId: customer.user.id, availableKopecks: 0 }, update: {} });
  await prisma.ledgerEntry.createMany({
    data: [
      { ownerId: customer.user.id, kind: 'topup', amountKopecks: netKopecks },
      { ownerId: customer.user.id, kind: 'hold', amountKopecks: -netKopecks, taskId: task.id },
    ],
  });
  await prisma.resultVersion.create({ data: { taskId: task.id, version: 1, status: 'submitted', submittedAt: new Date() } });
  const res = await api().post(`/api/tasks/${task.id}/accept`).set('Cookie', customer.cookie).set('Origin', ORIGIN);
  expect(res.status).toBe(200);
}

/** Makes the ledger insert inside the next transaction fail, to prove the request is all or nothing. */
async function withFailingLedger<T>(run: () => Promise<T>): Promise<T> {
  const original = appPrisma.$transaction;
  appPrisma.$transaction = ((fn: (tx: object) => unknown, options?: unknown) =>
    (original as (...a: unknown[]) => unknown).call(
      appPrisma,
      (tx: object) =>
        fn(
          new Proxy(tx, {
            get(target, prop) {
              if (prop === 'ledgerEntry') return { create: () => Promise.reject(new Error('injected failure')) };
              return Reflect.get(target, prop, target);
            },
          }),
        ),
      options,
    )) as never;
  try {
    return await run();
  } finally {
    appPrisma.$transaction = original;
  }
}

beforeEach(async () => {
  await resetDb();
  customer = await loginAs('customer');
  student = await loginAs('student');
});

describe('Withdrawal request: US-36', () => {
  it('US-36 sc.1 enough balance and a valid card: 201, a requested withdrawal, the balance goes down by exactly the amount, one withdrawal entry', async () => {
    await earn(student, 80_000);

    const res = await withdraw({ amountKopecks: 50_000, cardNumber: CARD }, student.cookie);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      withdrawal: {
        id: expect.any(String),
        amountKopecks: 50_000,
        cardLast4: '1111',
        status: 'requested',
        createdAt: expect.any(String),
        processedAt: null,
        reason: null,
      },
      balance: { availableKopecks: 30_000 },
    });
    expect(await balanceOf(student.user.id)).toBe(30_000);
    const row = await prisma.withdrawal.findUniqueOrThrow({ where: { id: res.body.withdrawal.id } });
    expect(row).toMatchObject({ studentId: student.user.id, amountKopecks: 50_000, cardNumber: CARD_DIGITS, cardLast4: '1111', status: 'requested' });
    const entries = await prisma.ledgerEntry.findMany({ where: { ownerId: student.user.id, kind: 'withdrawal' } });
    expect(entries.map((e) => [e.amountKopecks, e.withdrawalId])).toEqual([[-50_000, row.id]]);
    expect(await ledgerSum(student.user.id)).toBe(30_000); // INV-20
  });

  it('US-36 sc.1 the whole balance can be withdrawn: the balance is 0 afterwards', async () => {
    await earn(student, 30_000);
    const res = await withdraw({ amountKopecks: 30_000, cardNumber: CARD }, student.cookie);
    expect(res.status).toBe(201);
    expect(res.body.balance.availableKopecks).toBe(0);
    expect(await ledgerSum(student.user.id)).toBe(0);
  });

  it('US-36 sc.1 the full card number is never in an answer to the student, only the last four digits', async () => {
    await earn(student, 80_000);
    const created = await withdraw({ amountKopecks: 10_000, cardNumber: CARD }, student.cookie);
    const listed = await myWithdrawals(student.cookie);

    for (const body of [created.body, listed.body]) {
      const text = JSON.stringify(body);
      expect(text).not.toContain(CARD_DIGITS);
      expect(text).not.toContain('cardNumber');
    }
    expect(listed.body.withdrawals[0].cardLast4).toBe('1111');
  });

  // W-13, decided: «закордонного банку» cannot be detected without issuer (BIN) data, so only the format and Luhn are checked.
  it.each([
    ['15 digits', '4111 1111 1111 111'],
    ['17 digits', '4111 1111 1111 1111 1'],
    ['letters', 'abcd efgh ijkl mnop'],
    ['16 digits with a wrong checksum', '4111 1111 1111 1112'],
    ['dashes', '4111-1111-1111-1111'],
    ['a number instead of text', 4111111111111111],
    ['no card', undefined],
  ])('US-36 sc.2 %s: 400 CARD_INVALID, no request and the balance does not change', async (_name, cardNumber) => {
    await earn(student, 80_000);

    const res = await withdraw({ amountKopecks: 10_000, cardNumber }, student.cookie);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('CARD_INVALID');
    expect(res.body.error.details).toEqual([{ field: 'cardNumber', code: 'CARD_INVALID' }]);
    expect(await prisma.withdrawal.count()).toBe(0);
    expect(await balanceOf(student.user.id)).toBe(80_000);
  });

  it('US-36 sc.3 a balance of 300 UAH and a request of 500 UAH: 422 INSUFFICIENT_BALANCE with the message of the story, nothing changes', async () => {
    await earn(student, 30_000);

    const res = await withdraw({ amountKopecks: 50_000, cardNumber: CARD }, student.cookie);

    expect(res.status).toBe(422);
    expect(res.body.error).toMatchObject({ code: 'INSUFFICIENT_BALANCE', message: 'Недостатньо коштів на балансі для виведення' });
    expect(await balanceOf(student.user.id)).toBe(30_000);
    expect(await prisma.withdrawal.count()).toBe(0);
    expect(await prisma.ledgerEntry.count({ where: { ownerId: student.user.id, kind: 'withdrawal' } })).toBe(0);
  });

  it('US-36 sc.3 a student with no balance at all: 422 INSUFFICIENT_BALANCE', async () => {
    const res = await withdraw({ amountKopecks: 100, cardNumber: CARD }, student.cookie);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INSUFFICIENT_BALANCE');
    expect(await prisma.withdrawal.count()).toBe(0);
  });

  it('US-36 sc.3 an amount above any possible balance is 422 INSUFFICIENT_BALANCE, not a database error', async () => {
    await earn(student, 30_000);
    const res = await withdraw({ amountKopecks: LIMITS.balanceMaxKopecks + 1, cardNumber: CARD }, student.cookie);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INSUFFICIENT_BALANCE');
  });

  it('US-36 sc.3 race: a balance of 500 UAH and two requests of 300 UAH at once give one 201 and one 422, the balance is 200 UAH', async () => {
    await earn(student, 50_000);

    const results = await Promise.all([
      withdraw({ amountKopecks: 30_000, cardNumber: CARD }, student.cookie),
      withdraw({ amountKopecks: 30_000, cardNumber: CARD }, student.cookie),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([201, 422]);
    expect(results.find((r) => r.status === 422)!.body.error.code).toBe('INSUFFICIENT_BALANCE');
    expect(await balanceOf(student.user.id)).toBe(20_000);
    expect(await prisma.withdrawal.count()).toBe(1);
    expect(await prisma.ledgerEntry.count({ where: { ownerId: student.user.id, kind: 'withdrawal' } })).toBe(1);
    expect(await ledgerSum(student.user.id)).toBe(20_000); // INV-20
  });

  it('US-36 INV-20 a failure at the ledger step is 500 INTERNAL_ERROR: no request, the balance is unchanged (one transaction)', async () => {
    await earn(student, 80_000);

    const res = await withFailingLedger(() => withdraw({ amountKopecks: 50_000, cardNumber: CARD }, student.cookie));

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: { code: 'INTERNAL_ERROR', message: expect.any(String) } });
    expect(await balanceOf(student.user.id)).toBe(80_000);
    expect(await prisma.withdrawal.count()).toBe(0);
    expect(await ledgerSum(student.user.id)).toBe(80_000);
  });

  it.each([
    ['no amount', { cardNumber: CARD }],
    ['zero', { amountKopecks: 0, cardNumber: CARD }],
    ['negative', { amountKopecks: -100, cardNumber: CARD }],
    ['a fraction of a kopeck', { amountKopecks: 100.5, cardNumber: CARD }],
    ['text', { amountKopecks: '500', cardNumber: CARD }],
  ])('US-36 the amount %s: 400 VALIDATION_FAILED on amountKopecks, nothing changes', async (_name, body) => {
    await earn(student, 80_000);
    const res = await withdraw(body, student.cookie);
    expect(res.status).toBe(400);
    expect(res.body.error.details).toContainEqual({ field: 'amountKopecks', code: 'VALIDATION_FAILED' });
    expect(await prisma.withdrawal.count()).toBe(0);
    expect(await balanceOf(student.user.id)).toBe(80_000);
  });

  it('US-36 a forged status, owner or last digits in the body are ignored: the request is requested, the caller is the owner', async () => {
    await earn(student, 80_000);
    const other = await loginAs('student');

    const res = await withdraw({ amountKopecks: 10_000, cardNumber: CARD, status: 'paid', studentId: other.user.id, cardLast4: '9999' }, student.cookie);

    expect(res.status).toBe(201);
    const row = await prisma.withdrawal.findFirstOrThrow({});
    expect(row).toMatchObject({ studentId: student.user.id, status: 'requested', cardLast4: '1111' });
  });
});

describe('Access to withdrawals: US-36, INV-02', () => {
  it('US-36 without a session: 401 AUTH_REQUIRED for both endpoints', async () => {
    expect((await withdraw({ amountKopecks: 100, cardNumber: CARD })).body.error.code).toBe('AUTH_REQUIRED');
    expect((await myWithdrawals()).status).toBe(401);
  });

  it('US-36 a customer: 403 ROLE_FORBIDDEN, checked before the body (403 before 400)', async () => {
    const res = await withdraw({ amountKopecks: 0, cardNumber: 'x' }, customer.cookie);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ROLE_FORBIDDEN');
    expect((await myWithdrawals(customer.cookie)).body.error.code).toBe('ROLE_FORBIDDEN');
  });

  it('US-36 a moderator: 403 ROLE_FORBIDDEN', async () => {
    const moderator = await loginAs('moderator');
    expect((await withdraw({ amountKopecks: 100, cardNumber: CARD }, moderator.cookie)).body.error.code).toBe('ROLE_FORBIDDEN');
  });

  it('US-36 INV-02 a student who is not verified: 403 STUDENT_NOT_VERIFIED, no request', async () => {
    const unverified = await loginAs('student', { studentVerifiedAt: null });
    const res = await withdraw({ amountKopecks: 100, cardNumber: CARD }, unverified.cookie);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('STUDENT_NOT_VERIFIED');
    expect((await myWithdrawals(unverified.cookie)).body.error.code).toBe('STUDENT_NOT_VERIFIED');
    expect(await prisma.withdrawal.count()).toBe(0);
  });

  it('US-36 a student whose email is not confirmed: 403 EMAIL_NOT_CONFIRMED', async () => {
    const unconfirmed = await loginAs('student', { emailConfirmedAt: null, studentVerifiedAt: null });
    expect((await withdraw({ amountKopecks: 100, cardNumber: CARD }, unconfirmed.cookie)).body.error.code).toBe('EMAIL_NOT_CONFIRMED');
  });

  it('US-36 more than 10 requests a minute: 429 RATE_LIMITED', async () => {
    const app = api(); // one app, so the in-memory limiter keeps its count across the requests
    const send = () => app.post('/api/me/withdrawals').set('Cookie', student.cookie).set('Origin', ORIGIN).send({ amountKopecks: 100, cardNumber: CARD });
    const statuses: number[] = [];
    for (let i = 0; i < 10; i += 1) statuses.push((await send()).status);
    expect(statuses).toEqual(Array(10).fill(422)); // the limit counts every request, also the refused ones
    const blocked = await send();
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
  });
});

describe('My withdrawals list: US-36', () => {
  it('US-36 the list holds only my own requests, newest first, with status, last four digits and dates', async () => {
    await earn(student, 80_000);
    const other = await loginAs('student');
    await earn(other, 10_000);
    await withdraw({ amountKopecks: 10_000, cardNumber: CARD }, student.cookie);
    await withdraw({ amountKopecks: 20_000, cardNumber: '5555 5555 5555 4444' }, student.cookie);
    await withdraw({ amountKopecks: 5_000, cardNumber: CARD }, other.cookie);

    const res = await myWithdrawals(student.cookie);

    expect(res.status).toBe(200);
    expect(res.body.withdrawals.map((w: { amountKopecks: number; cardLast4: string }) => [w.amountKopecks, w.cardLast4])).toEqual([
      [20_000, '4444'],
      [10_000, '1111'],
    ]);
    expect(res.body.withdrawals.every((w: { status: string }) => w.status === 'requested')).toBe(true);
  });

  it('US-36 a student with no requests gets an empty list', async () => {
    const res = await myWithdrawals(student.cookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ withdrawals: [] });
  });

  it('US-36 the list is capped at LIMITS.withdrawalsMax', async () => {
    await prisma.withdrawal.createMany({
      data: Array.from({ length: LIMITS.withdrawalsMax + 5 }, (_, i) => ({
        studentId: student.user.id,
        amountKopecks: 100,
        cardLast4: '1111',
        status: 'paid',
        createdAt: new Date(Date.now() - i * 1000),
      })),
    });
    const res = await myWithdrawals(student.cookie);
    expect(res.body.withdrawals).toHaveLength(LIMITS.withdrawalsMax);
  });
});
