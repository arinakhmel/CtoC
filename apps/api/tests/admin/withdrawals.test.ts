import { LIMITS } from '@ctoc/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { hashSessionId } from '../../src/modules/identity/domain';
import { prisma as appPrisma } from '../../src/platform/db';
import { api } from '../helpers/app';
import { prisma, resetDb } from '../helpers/db';

/**
 * US-36, A-10 (OQ-10, OQ-42): the moderator processes withdrawal requests by hand, api.md §4.1d. `GET /api/mod/withdrawals`,
 * `POST /api/mod/withdrawals/:id/mark-paid` and `/reject`. Each decision applies only to a `requested` request (INV-24), clears
 * the full card number, and a rejection gives the money back with a `withdrawal_reversal` entry (INV-20).
 */

const ORIGIN = 'http://localhost:5173';
const CARD = '4111 1111 1111 1111';
const CARD_DIGITS = '4111111111111111';

let counter = 0;
async function loginAs(role: 'student' | 'customer' | 'moderator', overrides: Record<string, unknown> = {}) {
  counter += 1;
  const user = await prisma.user.create({
    data: {
      email: `modw${counter}@${role === 'student' ? 'university.edu.ua' : 'ctoc.local'}`,
      passwordHash: 'x',
      displayName: `Користувач ${counter}`,
      role,
      emailConfirmedAt: new Date(),
      studentVerifiedAt: role === 'student' ? new Date() : null,
      ...overrides,
    },
  });
  const sid = `modw-session-${counter}`;
  await prisma.session.create({ data: { id: hashSessionId(sid), userId: user.id, expiresAt: new Date(Date.now() + 3600_000) } });
  return { user, cookie: `sid=${sid}` };
}

type Login = Awaited<ReturnType<typeof loginAs>>;

const queue = (cookie?: string, status?: string) => {
  const req = api().get(`/api/mod/withdrawals${status ? `?status=${status}` : ''}`);
  return cookie ? req.set('Cookie', cookie) : req;
};
const markPaid = (id: string, cookie?: string) => {
  const req = api().post(`/api/mod/withdrawals/${id}/mark-paid`).set('Origin', ORIGIN);
  return cookie ? req.set('Cookie', cookie) : req;
};
const reject = (id: string, body: unknown, cookie?: string) => {
  const req = api().post(`/api/mod/withdrawals/${id}/reject`).set('Origin', ORIGIN);
  return (cookie ? req.set('Cookie', cookie) : req).send(body as object);
};
const balanceOf = async (ownerId: string) => (await prisma.balance.findUnique({ where: { ownerId } }))?.availableKopecks ?? 0;
const ledgerSum = async (ownerId: string) =>
  (await prisma.ledgerEntry.aggregate({ where: { ownerId }, _sum: { amountKopecks: true } }))._sum.amountKopecks ?? 0;

let moderator: Login;
let student: Login;

/**
 * A student with `balance` kopecks, backed by a ledger entry (INV-20), who then requests `amount` through the real endpoint.
 * Returns the id of the request.
 */
async function requested(owner: Login, balance: number, amount: number): Promise<string> {
  await prisma.balance.upsert({
    where: { ownerId: owner.user.id },
    create: { ownerId: owner.user.id, availableKopecks: balance },
    update: { availableKopecks: { increment: balance } },
  });
  await prisma.ledgerEntry.create({ data: { ownerId: owner.user.id, kind: 'topup', amountKopecks: balance } });
  const res = await api().post('/api/me/withdrawals').set('Cookie', owner.cookie).set('Origin', ORIGIN).send({ amountKopecks: amount, cardNumber: CARD });
  expect(res.status).toBe(201);
  return res.body.withdrawal.id as string;
}

beforeEach(async () => {
  await resetDb();
  moderator = await loginAs('moderator');
  student = await loginAs('student');
});

describe('Withdrawal queue of the moderator: A-10', () => {
  it('US-36 A-10 the queue lists the requested withdrawals oldest first, with the student name and the full card to pay by hand (OQ-42)', async () => {
    const first = await requested(student, 50_000, 10_000);
    const other = await loginAs('student');
    const second = await requested(other, 50_000, 20_000);

    const res = await queue(moderator.cookie);

    expect(res.status).toBe(200);
    expect(res.body.withdrawals.map((w: { id: string }) => w.id)).toEqual([first, second]);
    expect(res.body.withdrawals[0]).toEqual({
      id: first,
      student: { id: student.user.id, displayName: student.user.displayName },
      amountKopecks: 10_000,
      cardNumber: CARD_DIGITS,
      cardLast4: '1111',
      status: 'requested',
      createdAt: expect.any(String),
      processedAt: null,
      reason: null,
    });
    expect(JSON.stringify(res.body)).not.toContain('@'); // no email of a student
  });

  it('US-36 A-10 ?status=paid lists processed requests with no card number; an unknown status is 400 VALIDATION_FAILED', async () => {
    const id = await requested(student, 50_000, 10_000);
    await markPaid(id, moderator.cookie);

    expect((await queue(moderator.cookie)).body.withdrawals).toEqual([]);
    const paid = await queue(moderator.cookie, 'paid');
    expect(paid.body.withdrawals).toHaveLength(1);
    expect(paid.body.withdrawals[0]).toMatchObject({ id, status: 'paid', cardNumber: null, cardLast4: '1111' });

    const bad = await queue(moderator.cookie, 'deleted');
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('US-36 A-10 the queue is capped at LIMITS.withdrawalsMax', async () => {
    await prisma.withdrawal.createMany({
      data: Array.from({ length: LIMITS.withdrawalsMax + 3 }, () => ({ studentId: student.user.id, amountKopecks: 100, cardNumber: CARD_DIGITS, cardLast4: '1111', status: 'requested' })),
    });
    expect((await queue(moderator.cookie)).body.withdrawals).toHaveLength(LIMITS.withdrawalsMax);
  });
});

describe('Mark a withdrawal paid: A-10', () => {
  it('US-36 A-10 mark-paid: 200, status paid, the card number is cleared, the balance does not change again, an audit event', async () => {
    const id = await requested(student, 50_000, 30_000);

    const res = await markPaid(id, moderator.cookie);

    expect(res.status).toBe(200);
    expect(res.body.withdrawal).toMatchObject({ id, status: 'paid', cardNumber: null, cardLast4: '1111', processedAt: expect.any(String), reason: null });
    const row = await prisma.withdrawal.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({ status: 'paid', cardNumber: null, processedBy: moderator.user.id });
    expect(await balanceOf(student.user.id)).toBe(20_000);
    expect(await ledgerSum(student.user.id)).toBe(20_000); // INV-20: no entry of its own
    const audit = await prisma.auditEvent.findMany({ where: { entity: 'withdrawal', entityId: id } });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actorId: moderator.user.id, action: 'withdrawal.paid' });
    expect(audit[0]!.dataJson).not.toContain(CARD_DIGITS);
  });

  it('US-36 INV-24 a second mark-paid, or a reject after it, is 409 ALREADY_DECIDED and changes nothing', async () => {
    const id = await requested(student, 50_000, 30_000);
    await markPaid(id, moderator.cookie);

    const again = await markPaid(id, moderator.cookie);
    const late = await reject(id, { reason: 'Пізно' }, moderator.cookie);

    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ALREADY_DECIDED');
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe('ALREADY_DECIDED');
    expect((await prisma.withdrawal.findUniqueOrThrow({ where: { id } })).status).toBe('paid');
    expect(await balanceOf(student.user.id)).toBe(20_000);
    expect(await prisma.auditEvent.count()).toBe(1);
  });

  it('US-36 INV-24 race: two moderators decide one request at once (pay and reject): one 200, one 409, the money moves once', async () => {
    const id = await requested(student, 50_000, 30_000);
    const second = await loginAs('moderator');

    const results = await Promise.all([markPaid(id, moderator.cookie), reject(id, { reason: 'Невірна картка' }, second.cookie)]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(results.find((r) => r.status === 409)!.body.error.code).toBe('ALREADY_DECIDED');
    const row = await prisma.withdrawal.findUniqueOrThrow({ where: { id } });
    expect(row.cardNumber).toBeNull();
    // Whichever won, the balance equals its ledger and the reversal exists only for a rejection.
    const reversals = await prisma.ledgerEntry.count({ where: { withdrawalId: id, kind: 'withdrawal_reversal' } });
    expect(reversals).toBe(row.status === 'rejected' ? 1 : 0);
    expect(await balanceOf(student.user.id)).toBe(row.status === 'rejected' ? 50_000 : 20_000);
    expect(await ledgerSum(student.user.id)).toBe(await balanceOf(student.user.id));
  });

  it('US-36 an unknown request is 404 NOT_FOUND', async () => {
    expect((await markPaid('no-such-id', moderator.cookie)).body.error.code).toBe('NOT_FOUND');
    expect((await reject('no-such-id', { reason: 'x' }, moderator.cookie)).status).toBe(404);
  });
});

describe('Reject a withdrawal: A-10', () => {
  it('US-36 A-10 reject with a reason: 200, status rejected, the money is back on the balance with one withdrawal_reversal entry', async () => {
    const id = await requested(student, 50_000, 30_000);
    expect(await balanceOf(student.user.id)).toBe(20_000);

    const res = await reject(id, { reason: '  Картка заблокована банком  ' }, moderator.cookie);

    expect(res.status).toBe(200);
    expect(res.body.withdrawal).toMatchObject({ id, status: 'rejected', cardNumber: null, reason: 'Картка заблокована банком' });
    expect(await balanceOf(student.user.id)).toBe(50_000);
    const entries = await prisma.ledgerEntry.findMany({ where: { withdrawalId: id }, orderBy: { createdAt: 'asc' } });
    expect(entries.map((e) => [e.kind, e.amountKopecks])).toEqual([
      ['withdrawal', -30_000],
      ['withdrawal_reversal', 30_000],
    ]);
    expect(await ledgerSum(student.user.id)).toBe(50_000); // INV-20
    const audit = await prisma.auditEvent.findFirstOrThrow({ where: { entityId: id } });
    expect(audit.action).toBe('withdrawal.rejected');

    const mine = await api().get('/api/me/withdrawals').set('Cookie', student.cookie);
    expect(mine.body.withdrawals[0]).toMatchObject({ status: 'rejected', reason: 'Картка заблокована банком' });
  });

  it.each([
    ['no reason', {}],
    ['an empty reason', { reason: '' }],
    ['only spaces', { reason: '   ' }],
  ])('US-36 A-10 reject with %s: 400 REASON_REQUIRED, the request stays requested', async (_name, body) => {
    const id = await requested(student, 50_000, 30_000);
    const res = await reject(id, body, moderator.cookie);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('REASON_REQUIRED');
    expect((await prisma.withdrawal.findUniqueOrThrow({ where: { id } })).status).toBe('requested');
    expect(await balanceOf(student.user.id)).toBe(20_000);
  });

  it('US-36 A-10 a reason over the limit is 400 VALIDATION_FAILED', async () => {
    const id = await requested(student, 50_000, 30_000);
    const res = await reject(id, { reason: 'x'.repeat(LIMITS.moderationReasonMax + 1) }, moderator.cookie);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('US-36 INV-20 a failure at the ledger step of a rejection is 500: the request stays requested and the money is not returned twice', async () => {
    const id = await requested(student, 50_000, 30_000);
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
      res = await reject(id, { reason: 'Картка заблокована' }, moderator.cookie);
    } finally {
      appPrisma.$transaction = original;
    }

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    const row = await prisma.withdrawal.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({ status: 'requested', cardNumber: CARD_DIGITS });
    expect(await balanceOf(student.user.id)).toBe(20_000);
    expect(await ledgerSum(student.user.id)).toBe(20_000);
    expect(await prisma.auditEvent.count()).toBe(0);
  });
});

describe('Access to the withdrawal back office: INV-25', () => {
  it('US-36 INV-25 without a session: 401 AUTH_REQUIRED', async () => {
    expect((await queue()).status).toBe(401);
    expect((await markPaid('x')).status).toBe(401);
  });

  it.each(['student', 'customer'] as const)('US-36 INV-25 a %s: 403 ROLE_FORBIDDEN on all three, checked before the body, nothing changes', async (role) => {
    const id = await requested(student, 50_000, 30_000);
    const caller = role === 'student' ? student : await loginAs('customer');

    for (const res of [await queue(caller.cookie), await markPaid(id, caller.cookie), await reject(id, {}, caller.cookie)]) {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('ROLE_FORBIDDEN');
    }
    expect((await prisma.withdrawal.findUniqueOrThrow({ where: { id } })).status).toBe('requested');
  });
});
