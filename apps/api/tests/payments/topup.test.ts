import { beforeEach, describe, expect, it } from 'vitest';
import { hashSessionId } from '../../src/modules/identity/domain';
import { prisma as appPrisma } from '../../src/platform/db';
import { api } from '../helpers/app';
import { prisma, resetDb } from '../helpers/db';
import { createApplication, createTask } from '../helpers/factories';

const ORIGIN = 'http://localhost:5173';
let counter = 0;
async function loginAs(role: 'student' | 'customer', overrides: Record<string, unknown> = {}) {
  counter += 1;
  const user = await prisma.user.create({
    data: {
      email: `topup${counter}@${role === 'student' ? 'university.edu.ua' : 'company.com'}`,
      passwordHash: 'x',
      displayName: `Користувач ${counter}`,
      role,
      emailConfirmedAt: new Date(),
      studentVerifiedAt: role === 'student' ? new Date() : null,
      ...overrides,
    },
  });
  const sid = `topup-session-${counter}`;
  await prisma.session.create({ data: { id: hashSessionId(sid), userId: user.id, expiresAt: new Date(Date.now() + 3600_000) } });
  return { user, cookie: `sid=${sid}` };
}

const topUp = (body: unknown, cookie?: string) => {
  const req = api().post('/api/me/balance/sandbox-topup');
  return (cookie ? req.set('Cookie', cookie).set('Origin', ORIGIN) : req).send(body as object);
};
const balance = (cookie?: string) => {
  const req = api().get('/api/me/balance');
  return cookie ? req.set('Cookie', cookie) : req;
};
const assign = (taskId: string, applicationId: string, cookie: string, key: string) =>
  api().post(`/api/tasks/${taskId}/assign`).set('Cookie', cookie).set('Origin', ORIGIN).set('Idempotency-Key', key).send({ applicationId });
const balanceRow = async (ownerId: string) => (await prisma.balance.findUnique({ where: { ownerId } }))?.availableKopecks ?? null;
const ledgerSum = async (ownerId: string) => (await prisma.ledgerEntry.aggregate({ where: { ownerId }, _sum: { amountKopecks: true } }))._sum.amountKopecks ?? 0;

let customer: Awaited<ReturnType<typeof loginAs>>;
beforeEach(async () => {
  await resetDb();
  customer = await loginAs('customer');
});

describe('Sandbox top-up of the balance: US-26', () => {
  it('US-26 sc.1 a customer tops up 500 UAH: 200 with the new balance, one topup entry, and the amount adds up on a second top-up', async () => {
    const first = await topUp({ amountKopecks: 50_000 }, customer.cookie);
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ balance: { availableKopecks: 50_000 } });
    const second = await topUp({ amountKopecks: 20_000 }, customer.cookie);
    expect(second.body.balance.availableKopecks).toBe(70_000);

    expect(await balanceRow(customer.user.id)).toBe(70_000);
    const entries = await prisma.ledgerEntry.findMany({ where: { ownerId: customer.user.id }, orderBy: { createdAt: 'asc' } });
    expect(entries.map((e) => [e.kind, e.amountKopecks])).toEqual([['topup', 50_000], ['topup', 20_000]]);
    expect(entries.every((e) => e.taskId === null)).toBe(true);
  });

  it('US-26 sc.1 a customer who funds through the top-up reserves the full price of a task: no seeded balance', async () => {
    const student = await loginAs('student');
    const task = await createTask(customer.user.id, { title: 'Логотип для кав’ярні', priceKopecks: 50_000, publishedAt: new Date() });
    const application = await createApplication(task.id, student.user.id);
    expect((await topUp({ amountKopecks: 50_000 }, customer.cookie)).status).toBe(200);

    const res = await assign(task.id, application.id, customer.cookie, 'key-fund-aaaaaaaa');

    expect(res.status).toBe(200);
    expect(res.body.escrow).toMatchObject({ status: 'held', amountKopecks: 50_000 });
    expect((await balance(customer.cookie)).body.balance.availableKopecks).toBe(0);
    const entries = await prisma.ledgerEntry.findMany({ where: { ownerId: customer.user.id } });
    expect(entries.map((e) => [e.kind, e.amountKopecks]).sort()).toEqual([['hold', -50_000], ['topup', 50_000]]);
  });

  it('US-26 sc.2 a top-up of 300 UAH is not enough for a 500 UAH task: 422 INSUFFICIENT_FUNDS, the balance is still 300 UAH and nothing is taken', async () => {
    const student = await loginAs('student');
    const task = await createTask(customer.user.id, { priceKopecks: 50_000, publishedAt: new Date() });
    const application = await createApplication(task.id, student.user.id);
    await topUp({ amountKopecks: 30_000 }, customer.cookie);

    const res = await assign(task.id, application.id, customer.cookie, 'key-short-aaaaaaa');

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INSUFFICIENT_FUNDS');
    expect(await balanceRow(customer.user.id)).toBe(30_000);
    expect(await prisma.escrow.count()).toBe(0);
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe('published');
    // topping up the missing amount makes the same select work
    await topUp({ amountKopecks: 20_000 }, customer.cookie);
    expect((await assign(task.id, application.id, customer.cookie, 'key-short-bbbbbbb')).status).toBe(200);
    expect(await balanceRow(customer.user.id)).toBe(0);
  });

  it('INV-20 the balance equals the sum of its ledger entries after top-ups and a select', async () => {
    const student = await loginAs('student');
    const task = await createTask(customer.user.id, { priceKopecks: 50_000, publishedAt: new Date() });
    const application = await createApplication(task.id, student.user.id);
    await topUp({ amountKopecks: 80_000 }, customer.cookie);
    await topUp({ amountKopecks: 5_000 }, customer.cookie);
    await assign(task.id, application.id, customer.cookie, 'key-inv20-cccccc');

    expect(await balanceRow(customer.user.id)).toBe(35_000);
    expect(await ledgerSum(customer.user.id)).toBe(35_000);
  });

  // The connection limit is 1 (ADR-0004), so the two requests are serialised by the database. This proves the first-top-up path
  // (no balance row yet) and that the increment is done by the database, not what two parallel writers would do.
  it('US-26 two top-ups at once are both applied: the balance is the sum and there are two entries', async () => {
    const [a, b] = await Promise.all([topUp({ amountKopecks: 10_000 }, customer.cookie), topUp({ amountKopecks: 25_000 }, customer.cookie)]);

    expect([a.status, b.status]).toEqual([200, 200]);
    expect(await balanceRow(customer.user.id)).toBe(35_000);
    expect(await prisma.ledgerEntry.count({ where: { ownerId: customer.user.id } })).toBe(2);
    expect(await ledgerSum(customer.user.id)).toBe(35_000);
  });

  it('US-26 INV-20 a failure at the ledger step is 500 INTERNAL_ERROR and the balance is not changed (one transaction)', async () => {
    await topUp({ amountKopecks: 10_000 }, customer.cookie);
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
    let res;
    try {
      res = await topUp({ amountKopecks: 40_000 }, customer.cookie);
    } finally {
      appPrisma.$transaction = original;
    }

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(await balanceRow(customer.user.id)).toBe(10_000);
    expect(await prisma.ledgerEntry.count()).toBe(1);
  });

  it.each([
    ['no amount', {}],
    ['zero', { amountKopecks: 0 }],
    ['negative', { amountKopecks: -100 }],
    ['under 1 UAH', { amountKopecks: 99 }],
    ['over the maximum', { amountKopecks: 2_000_001 }],
    ['fractional', { amountKopecks: 150.5 }],
    ['text', { amountKopecks: '500' }],
    ['null', { amountKopecks: null }],
  ])('US-26 %s is 400 VALIDATION_FAILED and nothing is stored', async (_name, body) => {
    const res = await topUp(body, customer.cookie);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(await prisma.balance.count()).toBe(0);
    expect(await prisma.ledgerEntry.count()).toBe(0);
  });

  it('US-26 the limits themselves are accepted: 1 UAH and 20 000 UAH', async () => {
    expect((await topUp({ amountKopecks: 100 }, customer.cookie)).status).toBe(200);
    expect((await topUp({ amountKopecks: 2_000_000 }, customer.cookie)).body.balance.availableKopecks).toBe(2_000_100);
  });

  it('US-26 a forged owner or ledger kind in the body is ignored: the owner is the session and the kind is topup', async () => {
    const other = await loginAs('customer');
    const res = await topUp({ amountKopecks: 10_000, ownerId: other.user.id, kind: 'payout', taskId: 'x' }, customer.cookie);
    expect(res.status).toBe(200);
    expect(await balanceRow(other.user.id)).toBeNull();
    const entry = await prisma.ledgerEntry.findFirstOrThrow({});
    expect(entry).toMatchObject({ ownerId: customer.user.id, kind: 'topup', amountKopecks: 10_000, taskId: null });
  });

  it('US-26 access: no session 401, a student 403 ROLE_FORBIDDEN, an unconfirmed customer 403 EMAIL_NOT_CONFIRMED (also with a bad body)', async () => {
    expect((await topUp({ amountKopecks: 10_000 })).status).toBe(401);
    const student = await loginAs('student');
    const forbidden = await topUp({ amountKopecks: 10_000 }, student.cookie);
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.code).toBe('ROLE_FORBIDDEN');
    const unconfirmed = await loginAs('customer', { emailConfirmedAt: null });
    expect((await topUp({}, unconfirmed.cookie)).body.error.code).toBe('EMAIL_NOT_CONFIRMED');
    expect(await prisma.balance.count()).toBe(0);
  });
});

describe('GET /api/me/balance: US-26', () => {
  it('US-26 a customer with no balance yet has 0; after a top-up the balance shows', async () => {
    const empty = await balance(customer.cookie);
    expect(empty.status).toBe(200);
    expect(empty.body).toEqual({ balance: { availableKopecks: 0 } });
    await topUp({ amountKopecks: 12_345 }, customer.cookie);
    expect((await balance(customer.cookie)).body.balance.availableKopecks).toBe(12_345);
  });

  it('US-26 the balance is not cached: Cache-Control no-store, so a top-up or a hold shows on the next request', async () => {
    const res = await balance(customer.cookie);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('US-26 everyone reads only their own balance', async () => {
    const other = await loginAs('customer');
    await topUp({ amountKopecks: 50_000 }, customer.cookie);
    expect((await balance(other.cookie)).body.balance.availableKopecks).toBe(0);
  });

  it('US-26 a verified student can read the balance (0), an unverified student is 403 STUDENT_NOT_VERIFIED, no session 401', async () => {
    const student = await loginAs('student');
    expect((await balance(student.cookie)).body.balance.availableKopecks).toBe(0);
    const unverified = await loginAs('student', { studentVerifiedAt: null });
    const res = await balance(unverified.cookie);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('STUDENT_NOT_VERIFIED');
    expect((await balance()).status).toBe(401);
  });
});
