import { beforeEach, describe, expect, it } from 'vitest';
import { hashSessionId } from '../../src/modules/identity/domain';
import { api } from '../helpers/app';
import { prisma, resetDb } from '../helpers/db';

async function login(role: 'customer' | 'student', confirmed = true) {
  const user = await prisma.user.create({
    data: {
      email: `${role}${confirmed ? '' : '-unconfirmed'}@example.com`,
      passwordHash: 'x',
      displayName: 'Тест Користувач',
      role,
      emailConfirmedAt: confirmed ? new Date() : null,
    },
  });
  const sid = `create-task-${role}-${confirmed}`;
  await prisma.session.create({ data: { id: hashSessionId(sid), userId: user.id, expiresAt: new Date(Date.now() + 3600_000) } });
  return { user, cookie: `sid=${sid}` };
}

const valid = () => ({
  title: 'Логотип для кав’ярні',
  description: 'Потрібен простий логотип у двох кольорах.',
  priceKopecks: 40_000,
  deadlineAt: new Date(Date.now() + 7 * 24 * 3600_000).toISOString(),
});
const ORIGIN = 'http://localhost:5173';
const post = (cookie: string | null, body: unknown) => {
  const req = api().post('/api/tasks');
  return (cookie ? req.set('Cookie', cookie).set('Origin', ORIGIN) : req).send(body as object);
};

let customer: Awaited<ReturnType<typeof login>>;
beforeEach(async () => {
  await resetDb();
  customer = await login('customer');
});

describe('US-16 sc.1: a valid form goes to moderation', () => {
  it('US-16 sc.1 valid form → 201, pending_moderation, saved for the customer', async () => {
    const res = await post(customer.cookie, valid());

    expect(res.status).toBe(201);
    expect(res.body.task).toMatchObject({ title: 'Логотип для кав’ярні', priceKopecks: 40_000, status: 'pending_moderation' });
    const row = await prisma.task.findUniqueOrThrow({ where: { id: res.body.task.id } });
    expect(row).toMatchObject({ customerId: customer.user.id, status: 'pending_moderation', executorId: null, commissionBp: null, publishedAt: null });
  });

  it('US-16 sc.1 the new task is not in the feed until a moderator publishes it', async () => {
    await post(customer.cookie, valid());
    const student = await login('student');

    const feed = await api().get('/api/tasks').set('Cookie', student.cookie);

    expect(feed.body.tasks).toHaveLength(0);
  });

  it('US-16 sc.1 / US-40 sc.3 a forged status, executor and commission are ignored', async () => {
    const res = await post(customer.cookie, { ...valid(), status: 'published', executorId: 'x', commissionKopecks: 1, customerId: 'other' });

    expect(res.status).toBe(201);
    const row = await prisma.task.findUniqueOrThrow({ where: { id: res.body.task.id } });
    expect(row).toMatchObject({ status: 'pending_moderation', executorId: null, commissionKopecks: null, customerId: customer.user.id });
  });
});

describe('US-16 sc.2: an empty description', () => {
  it('US-16 sc.2 empty description → 400 VALIDATION_FAILED with details for the field', async () => {
    const res = await post(customer.cookie, { ...valid(), description: '' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.details).toEqual([{ field: 'description', code: 'VALIDATION_FAILED' }]);
    expect(await prisma.task.count()).toBe(0);
  });

  it('US-16 sc.2 a whitespace-only description is empty too', async () => {
    const res = await post(customer.cookie, { ...valid(), description: '   ' });
    expect(res.body.error.details).toEqual([{ field: 'description', code: 'VALIDATION_FAILED' }]);
  });
});

describe('US-16 sc.3: a 1-character title', () => {
  it('US-16 sc.3 title "A" → 400 TITLE_TOO_SHORT with details for the title', async () => {
    const res = await post(customer.cookie, { ...valid(), title: 'A' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('TITLE_TOO_SHORT');
    expect(res.body.error.details).toEqual([{ field: 'title', code: 'TITLE_TOO_SHORT' }]);
    expect(await prisma.task.count()).toBe(0);
  });
});

describe('US-16 access (api.md §1)', () => {
  it('no session → 401 AUTH_REQUIRED', async () => {
    const res = await post(null, valid());
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_REQUIRED');
  });

  it('a student → 403 ROLE_FORBIDDEN, even with a bad body (403 before 400)', async () => {
    const student = await login('student');
    const res = await post(student.cookie, { title: 'A' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ROLE_FORBIDDEN');
  });

  it('a customer with an unconfirmed email → 403 EMAIL_NOT_CONFIRMED', async () => {
    const unconfirmed = await login('customer', false);
    const res = await post(unconfirmed.cookie, valid());
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('EMAIL_NOT_CONFIRMED');
    expect(await prisma.task.count()).toBe(0);
  });
});

describe('US-17 and US-15 on the same endpoint', () => {
  it('US-17 sc.1 price 40000 kopecks is stored', async () => {
    const res = await post(customer.cookie, valid());
    expect(res.status).toBe(201);
    expect(res.body.task.priceKopecks).toBe(40_000);
  });

  it('US-17 sc.2 price 2000 kopecks → 400 PRICE_BELOW_MIN', async () => {
    const res = await post(customer.cookie, { ...valid(), priceKopecks: 2000 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('PRICE_BELOW_MIN');
  });

  it('US-15 sc.2 price 0 → 400 PRICE_BELOW_MIN at creation (W-04)', async () => {
    const res = await post(customer.cookie, { ...valid(), priceKopecks: 0 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('PRICE_BELOW_MIN');
    expect(await prisma.task.count()).toBe(0);
  });

  it('US-17 sc.3 a non-numeric price → 400 VALIDATION_FAILED', async () => {
    const res = await post(customer.cookie, { ...valid(), priceKopecks: 'abc' });
    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual([{ field: 'priceKopecks', code: 'VALIDATION_FAILED' }]);
  });

  it('a deadline in the past → 400 DEADLINE_IN_PAST', async () => {
    const res = await post(customer.cookie, { ...valid(), deadlineAt: '2020-01-01T00:00:00.000Z' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('DEADLINE_IN_PAST');
  });
});
