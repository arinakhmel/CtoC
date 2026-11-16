import { beforeEach, describe, expect, it } from 'vitest';
import { hashSessionId } from '../../src/modules/identity/domain';
import { api } from '../helpers/app';
import { prisma, resetDb } from '../helpers/db';
import { createTask, createUser } from '../helpers/factories';

let counter = 0;
async function loginAs(overrides: Record<string, unknown> = {}) {
  counter += 1;
  const user = await prisma.user.create({
    data: {
      email: `mine${counter}@university.edu.ua`,
      passwordHash: 'x',
      displayName: 'Олена Коваль',
      role: 'student',
      emailConfirmedAt: new Date(),
      studentVerifiedAt: new Date(),
      ...overrides,
    },
  });
  const sid = `mine-session-${counter}`;
  await prisma.session.create({ data: { id: hashSessionId(sid), userId: user.id, expiresAt: new Date(Date.now() + 3600_000) } });
  return { user, cookie: `sid=${sid}` };
}

let customerId: string;
const publish = (overrides: Record<string, unknown> = {}) => createTask(customerId, { publishedAt: new Date(), ...overrides });
const list = (cookie?: string) => (cookie ? api().get('/api/me/applications').set('Cookie', cookie) : api().get('/api/me/applications'));

beforeEach(async () => {
  await resetDb();
  customerId = (await createUser({ role: 'customer', email: 'owner@company.com' })).id;
});

describe('GET /api/me/applications: US-20', () => {
  it('US-20 sc.1 a new application is listed with the status sent (Надіслано), the task and the note', async () => {
    const { cookie, user } = await loginAs();
    const task = await publish({ title: 'Логотип для кав’ярні', priceKopecks: 50_000 });
    await prisma.application.create({ data: { taskId: task.id, studentId: user.id, status: 'sent', note: 'Маю досвід' } });

    const res = await list(cookie);

    expect(res.status).toBe(200);
    expect(res.body.applications).toHaveLength(1);
    expect(res.body.applications[0]).toMatchObject({
      taskId: task.id,
      status: 'sent',
      note: 'Маю досвід',
      task: { id: task.id, title: 'Логотип для кав’ярні', priceKopecks: 50_000 },
    });
    expect(Object.keys(res.body.applications[0]).sort()).toEqual(['createdAt', 'id', 'note', 'status', 'task', 'taskId']);
  });

  // The customer's assign (US-25) does not exist yet, so the state it produces is set in the database (traceability W-20).
  it('US-20 sc.2 an accepted application shows the status accepted (Прийнято)', async () => {
    const { cookie, user } = await loginAs();
    const task = await publish();
    await prisma.application.create({ data: { taskId: task.id, studentId: user.id, status: 'sent' } });
    expect((await list(cookie)).body.applications[0].status).toBe('sent');

    await prisma.application.updateMany({ where: { taskId: task.id, studentId: user.id }, data: { status: 'accepted', decidedAt: new Date() } });
    const res = await list(cookie);

    expect(res.status).toBe(200);
    expect(res.body.applications[0].status).toBe('accepted');
  });

  it('US-20 sc.3 a rejected application (another candidate chosen) shows the status rejected (Відхилено)', async () => {
    const { cookie, user } = await loginAs();
    const other = await loginAs();
    const task = await publish();
    await prisma.application.create({ data: { taskId: task.id, studentId: user.id, status: 'rejected', decidedAt: new Date() } });
    await prisma.application.create({ data: { taskId: task.id, studentId: other.user.id, status: 'accepted', decidedAt: new Date() } });

    const res = await list(cookie);

    expect(res.status).toBe(200);
    expect(res.body.applications).toHaveLength(1);
    expect(res.body.applications[0].status).toBe('rejected');
  });

  it('US-20 a student sees only their own applications, newest first', async () => {
    const { cookie, user } = await loginAs();
    const other = await loginAs();
    const first = await publish({ title: 'Перше завдання' });
    const second = await publish({ title: 'Друге завдання' });
    const foreign = await publish({ title: 'Чуже завдання' });
    await prisma.application.create({ data: { taskId: first.id, studentId: user.id, status: 'sent', createdAt: new Date('2026-11-01T10:00:00Z') } });
    await prisma.application.create({ data: { taskId: second.id, studentId: user.id, status: 'sent', createdAt: new Date('2026-11-02T10:00:00Z') } });
    await prisma.application.create({ data: { taskId: foreign.id, studentId: other.user.id, status: 'sent' } });

    const res = await list(cookie);

    expect(res.body.applications.map((a: { task: { title: string } }) => a.task.title)).toEqual(['Друге завдання', 'Перше завдання']);
  });

  it('US-20 a student with no applications gets an empty list', async () => {
    const { cookie } = await loginAs();
    const res = await list(cookie);
    expect(res.status).toBe(200);
    expect(res.body.applications).toEqual([]);
  });

  it('US-20 an unverified student can still see the list (S-)', async () => {
    const { cookie } = await loginAs({ studentVerifiedAt: null });
    expect((await list(cookie)).status).toBe(200);
  });

  it('US-20 no session is 401 AUTH_REQUIRED', async () => {
    const res = await list();
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_REQUIRED');
  });

  it('US-20 a customer is 403 ROLE_FORBIDDEN and an unconfirmed student 403 EMAIL_NOT_CONFIRMED', async () => {
    const customer = await loginAs({ role: 'customer', studentVerifiedAt: null });
    const unconfirmed = await loginAs({ emailConfirmedAt: null });
    const a = await list(customer.cookie);
    expect(a.status).toBe(403);
    expect(a.body.error.code).toBe('ROLE_FORBIDDEN');
    const b = await list(unconfirmed.cookie);
    expect(b.status).toBe(403);
    expect(b.body.error.code).toBe('EMAIL_NOT_CONFIRMED');
  });
});
