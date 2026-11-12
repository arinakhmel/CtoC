import { beforeEach, describe, expect, it } from 'vitest';
import { hashSessionId } from '../../src/modules/identity/domain';
import { api } from '../helpers/app';
import { prisma, resetDb } from '../helpers/db';
import { createTask, createUser } from '../helpers/factories';

async function loginAsStudent() {
  const user = await prisma.user.create({
    data: {
      email: 'net@university.edu.ua',
      passwordHash: 'x',
      displayName: 'Олена Коваль',
      role: 'student',
      emailConfirmedAt: new Date(),
    },
  });
  const sid = 'net-price-session';
  await prisma.session.create({ data: { id: hashSessionId(sid), userId: user.id, expiresAt: new Date(Date.now() + 3600_000) } });
  return `sid=${sid}`;
}

let customerId: string;
let cookie: string;
/** A published task with the commission snapshot that publication takes (INV-08). */
const publish = (overrides: Record<string, unknown> = {}) => createTask(customerId, { publishedAt: new Date(), ...overrides });
const get = (path: string) => api().get(path).set('Cookie', cookie);

beforeEach(async () => {
  await resetDb();
  customerId = (await createUser({ role: 'customer', email: 'owner@company.com' })).id;
  cookie = await loginAsStudent();
});

describe('US-15 sc.1: gross price and net amount', () => {
  const snapshot = { priceKopecks: 100_000, commissionBp: 1000, commissionKopecks: 10_000, netKopecks: 90_000 };

  it('US-15 sc.1 the feed card carries 100000 gross, 10000 commission and 90000 net', async () => {
    await publish(snapshot);

    const res = await get('/api/tasks');

    expect(res.status).toBe(200);
    expect(res.body.tasks).toHaveLength(1);
    expect(res.body.tasks[0]).toMatchObject({ priceKopecks: 100_000, commissionKopecks: 10_000, netKopecks: 90_000 });
  });

  it('US-15 sc.1 the details carry the same amounts', async () => {
    const task = await publish(snapshot);

    const res = await get(`/api/tasks/${task.id}`);

    expect(res.status).toBe(200);
    expect(res.body.task).toMatchObject({ priceKopecks: 100_000, commissionKopecks: 10_000, netKopecks: 90_000 });
  });

  it('US-15 sc.1 / INV-08 gross = commission + net on the card', async () => {
    await publish({ priceKopecks: 1005, commissionBp: 1000, commissionKopecks: 101, netKopecks: 904 });
    const { priceKopecks, commissionKopecks, netKopecks } = (await get('/api/tasks')).body.tasks[0];
    expect(commissionKopecks + netKopecks).toBe(priceKopecks);
  });

  // NFR-20: the card shows the snapshot taken at publication. A rate that changes later must not move it.
  it('US-15 sc.1 / NFR-20 the net is the stored snapshot, not recomputed from the current rate', async () => {
    const task = await publish(snapshot);
    await prisma.setting.upsert({
      where: { key: 'commission_bp' },
      update: { value: 3000 },
      create: { key: 'commission_bp', value: 3000, updatedBy: customerId },
    });

    const res = await get(`/api/tasks/${task.id}`);

    expect(res.body.task.netKopecks).toBe(90_000);
  });

  // Open point 1, decided: a published row without a snapshot gets no net, never an invented one (US-40 writes it).
  it('US-15 sc.1 a published task without a snapshot has null commission and net', async () => {
    const task = await publish({ priceKopecks: 100_000 });

    const feed = await get('/api/tasks');
    const details = await get(`/api/tasks/${task.id}`);

    expect(feed.body.tasks[0]).toMatchObject({ priceKopecks: 100_000, commissionKopecks: null, netKopecks: null });
    expect(details.body.task).toMatchObject({ priceKopecks: 100_000, commissionKopecks: null, netKopecks: null });
  });

  it('US-15 sc.1 the card does not expose the commission rate', async () => {
    await publish(snapshot);
    const res = await get('/api/tasks');
    expect(res.body.tasks[0]).not.toHaveProperty('commissionBp');
  });
});

// W-04, decided: price 0 or less is rejected at creation (400 PRICE_BELOW_MIN), so it never reaches moderation.
// The 400 itself needs POST /api/tasks (US-16, US-17) and is asserted there. Here: the database refuses it too.
describe('US-15 sc.2: a price of 0 or less cannot exist', () => {
  it.each([0, -1, -50_000])('US-15 sc.2 the database refuses a task with price %s, so no net is ever calculated', async (price) => {
    await expect(createTask(customerId, { priceKopecks: price })).rejects.toThrow(/constraint/i);
  });
});
