import { beforeEach, describe, expect, it } from 'vitest';
import { LIMITS } from '@ctoc/shared';
import { hashSessionId } from '../../src/modules/identity/domain';
import { api } from '../helpers/app';
import { prisma, resetDb } from '../helpers/db';

const ORIGIN = 'http://localhost:5173';
let customer: { id: string; cookie: string };

beforeEach(async () => {
  await resetDb();
  const user = await prisma.user.create({
    data: { email: 'cap@company.com', passwordHash: 'x', displayName: 'Замовник', role: 'customer', emailConfirmedAt: new Date() },
  });
  await prisma.session.create({ data: { id: hashSessionId('cap-session'), userId: user.id, expiresAt: new Date(Date.now() + 3600_000) } });
  customer = { id: user.id, cookie: 'sid=cap-session' };
});

const topUp = (amountKopecks: number) =>
  api().post('/api/me/balance/sandbox-topup').set('Cookie', customer.cookie).set('Origin', ORIGIN).send({ amountKopecks });

describe('The balance cap of the sandbox top-up: US-26', () => {
  it('US-26 a top-up that would pass the highest balance is 400 VALIDATION_FAILED and changes nothing; reaching it exactly is fine', async () => {
    const max = LIMITS.balanceMaxKopecks;
    await prisma.balance.create({ data: { ownerId: customer.id, availableKopecks: max - 100 } });

    const over = await topUp(101);
    expect(over.status).toBe(400);
    expect(over.body.error.code).toBe('VALIDATION_FAILED');
    expect((await prisma.balance.findUniqueOrThrow({ where: { ownerId: customer.id } })).availableKopecks).toBe(max - 100);
    expect(await prisma.ledgerEntry.count({ where: { ownerId: customer.id } })).toBe(0);

    const exact = await topUp(100);
    expect(exact.status).toBe(200);
    expect(exact.body.balance.availableKopecks).toBe(max);
  });

  it('US-26 the highest balance fits the 32-bit integer of the column, so a read never fails', () => {
    expect(LIMITS.balanceMaxKopecks + LIMITS.sandboxTopUp.max).toBeLessThan(2 ** 31);
  });

  it('US-26 a failed first top-up leaves no empty balance row behind', async () => {
    expect((await topUp(5)).status).toBe(400);
    expect(await prisma.balance.count({ where: { ownerId: customer.id } })).toBe(0);
  });

  it('US-26 the top-up is limited to 30 a minute: the 31st is 429 RATE_LIMITED', async () => {
    // One app for all requests: the limiter lives in the app, and `api()` makes a fresh one each time.
    const app = api();
    const send = () => app.post('/api/me/balance/sandbox-topup').set('Cookie', customer.cookie).set('Origin', ORIGIN).send({ amountKopecks: 100 });
    for (let i = 0; i < 30; i += 1) expect((await send()).status).toBe(200);
    const res = await send();
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
  });
});
