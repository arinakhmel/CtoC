import { LIMITS } from '@ctoc/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hashSessionId } from '../../src/modules/identity/domain';
import * as notificationsRepo from '../../src/modules/notifications/repo';
import { api } from '../helpers/app';
import { prisma, resetDb } from '../helpers/db';
import { createTask } from '../helpers/factories';

/**
 * US-40: the moderator's queue of tasks, api.md §4.14a. `GET /api/mod/tasks`, `POST …/:id/publish` and `/reject`. The commission
 * snapshot is written by the publish (OQ-22, INV-08); the first decision wins (INV-24). // OQ-03: «На перевірці» = pending_moderation.
 */

const ORIGIN = 'http://localhost:5173';
let counter = 0;
async function loginAs(role: 'student' | 'customer' | 'moderator') {
  counter += 1;
  const user = await prisma.user.create({
    data: {
      email: `modt${counter}@${role === 'student' ? 'university.edu.ua' : 'ctoc.local'}`,
      passwordHash: 'x',
      displayName: `Користувач ${counter}`,
      role,
      emailConfirmedAt: new Date(),
    },
  });
  const sid = `modt-session-${counter}`;
  await prisma.session.create({ data: { id: hashSessionId(sid), userId: user.id, expiresAt: new Date(Date.now() + 3600_000) } });
  return { user, cookie: `sid=${sid}` };
}
type Login = Awaited<ReturnType<typeof loginAs>>;

const withCookie = <T extends { set: (k: string, v: string) => T }>(req: T, cookie?: string) => (cookie ? req.set('Cookie', cookie) : req);
const queue = (cookie?: string, status?: string) => withCookie(api().get(`/api/mod/tasks${status ? `?status=${status}` : ''}`), cookie);
const publish = (id: string, cookie?: string) => withCookie(api().post(`/api/mod/tasks/${id}/publish`).set('Origin', ORIGIN), cookie);
const reject = (id: string, body: unknown, cookie?: string) => withCookie(api().post(`/api/mod/tasks/${id}/reject`).set('Origin', ORIGIN), cookie).send(body as object);
const ownerDelete = (id: string, cookie: string) => api().delete(`/api/tasks/${id}`).set('Cookie', cookie).set('Origin', ORIGIN);
const notificationsOf = (cookie: string) => api().get('/api/me/notifications').set('Cookie', cookie);
const feedIds = async (cookie: string) => ((await api().get('/api/tasks').set('Cookie', cookie)).body.tasks as { id: string }[]).map((t) => t.id);
const auditCount = () => prisma.auditEvent.count({ where: { action: { startsWith: 'task.' } } });

let moderator: Login;
let customer: Login;
let student: Login;
const pendingTask = (overrides: Record<string, unknown> = {}) =>
  createTask(customer.user.id, { title: 'Логотип для кав’ярні', priceKopecks: 100_000, status: 'pending_moderation', ...overrides });

beforeEach(async () => {
  await resetDb();
  moderator = await loginAs('moderator');
  customer = await loginAs('customer');
  student = await loginAs('student');
});
afterEach(() => vi.restoreAllMocks());

describe('US-40 sc.1 publish', () => {
  it('US-40 sc.1 publish → 200, published, snapshot 1000 грн / 10 % = 100000 / 10000 / 90000, in the feed, customer is told', async () => {
    const task = await pendingTask();

    const res = await publish(task.id, moderator.cookie);

    expect(res.status).toBe(200);
    expect(res.body.task).toMatchObject({ id: task.id, status: 'published', priceKopecks: 100_000 });
    const row = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(row).toMatchObject({ status: 'published', commissionBp: 1000, commissionKopecks: 10_000, netKopecks: 90_000 });
    expect(row.publishedAt).not.toBeNull();
    expect(await feedIds(student.cookie)).toEqual([task.id]);
    const notes = await notificationsOf(customer.cookie);
    expect(notes.body.notifications.map((n: { text: string }) => n.text)).toContain('Ваше завдання «Логотип для кав’ярні» опубліковано');
    expect(await auditCount()).toBe(1);
  });

  it('US-40 sc.1 the rate is the setting when it exists, not the default', async () => {
    await prisma.setting.create({ data: { key: 'commission_bp', value: 2000 } });
    const task = await pendingTask();

    await publish(task.id, moderator.cookie);

    expect(await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).toMatchObject({ commissionBp: 2000, commissionKopecks: 20_000, netKopecks: 80_000 });
  });

  it.each([20_000, -1, 5001])('US-40 sc.1 a stored rate of %s is outside 0..5000: 500 INTERNAL_ERROR, nothing published, no snapshot, no notification', async (value) => {
    await prisma.setting.create({ data: { key: 'commission_bp', value } });
    const task = await pendingTask();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const res = await publish(task.id, moderator.cookie);

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).toMatchObject({
      status: 'pending_moderation',
      commissionBp: null,
      commissionKopecks: null,
      netKopecks: null,
      publishedAt: null,
    });
    expect(await auditCount()).toBe(0);
    expect(await prisma.notification.count()).toBe(0);
  });

  it.each([0, 5000])('US-40 sc.1 the limits of the range, %s, are accepted', async (value) => {
    await prisma.setting.create({ data: { key: 'commission_bp', value } });
    const task = await pendingTask();

    expect((await publish(task.id, moderator.cookie)).status).toBe(200);
    const row = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(row.commissionKopecks! + row.netKopecks!).toBe(100_000);
    expect(row.netKopecks).toBeGreaterThanOrEqual(0);
  });

  it('US-40 the queue holds at most LIMITS.taskQueueMax rows', async () => {
    await prisma.task.createMany({
      data: Array.from({ length: LIMITS.taskQueueMax + 2 }, (_, i) => ({
        customerId: customer.user.id,
        title: `Завдання ${i}`,
        description: 'Опис',
        priceKopecks: 10_000,
        deadlineAt: new Date(Date.now() + 86_400_000),
        status: 'pending_moderation',
      })),
    });
    expect((await queue(moderator.cookie)).body.items).toHaveLength(LIMITS.taskQueueMax);
  });

  it('US-40 sc.1 an unknown id is 404 NOT_FOUND', async () => {
    const res = await publish('00000000-0000-0000-0000-000000000000', moderator.cookie);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('US-40 sc.1 a repeat is 409 ALREADY_DECIDED and changes nothing', async () => {
    const task = await pendingTask();
    await publish(task.id, moderator.cookie);
    const before = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });

    const res = await publish(task.id, moderator.cookie);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ALREADY_DECIDED');
    expect(await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).toEqual(before);
    expect(await auditCount()).toBe(1);
    expect(await prisma.notification.count()).toBe(1);
  });
});

describe('US-40 sc.2 reject', () => {
  it('US-40 sc.2 reject with a reason → 200, rejected, not in the feed, 404 for a student, the customer reads the reason', async () => {
    const task = await pendingTask();

    const res = await reject(task.id, { reason: 'домашнє завдання' }, moderator.cookie);

    expect(res.status).toBe(200);
    expect(res.body.task).toMatchObject({ status: 'rejected', moderationReason: 'домашнє завдання' });
    expect(await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).toMatchObject({ status: 'rejected', commissionBp: null, publishedAt: null });
    expect(await feedIds(student.cookie)).toEqual([]);
    expect((await api().get(`/api/tasks/${task.id}`).set('Cookie', student.cookie)).status).toBe(404);
    const notes = await notificationsOf(customer.cookie);
    expect(notes.body.notifications.map((n: { text: string }) => n.text)).toContain('Ваше завдання «Логотип для кав’ярні» відхилено. Причина: домашнє завдання');
    expect(await auditCount()).toBe(1);
  });

  it.each([{}, { reason: '' }, { reason: '   ' }])('US-40 sc.2 without a reason (%j) → 400 REASON_REQUIRED, still pending_moderation, no notification', async (body) => {
    const task = await pendingTask();

    const res = await reject(task.id, body, moderator.cookie);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('REASON_REQUIRED');
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe('pending_moderation');
    expect(await prisma.notification.count()).toBe(0);
    expect(await auditCount()).toBe(0);
  });

  it('US-40 sc.2 a decided task cannot be rejected: 409 ALREADY_DECIDED', async () => {
    const task = await pendingTask();
    await publish(task.id, moderator.cookie);

    const res = await reject(task.id, { reason: 'пізно' }, moderator.cookie);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ALREADY_DECIDED');
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe('published');
  });
});

describe('US-40 the queue', () => {
  it('lists waiting tasks oldest first with the documented fields and no customer email; other statuses by ?status', async () => {
    const newer = await pendingTask({ title: 'Новіше', createdAt: new Date('2026-11-02T10:00:00Z') });
    const older = await pendingTask({ title: 'Старіше', createdAt: new Date('2026-11-01T10:00:00Z') });
    await createTask(customer.user.id, { status: 'rejected', moderationReason: 'Домашня робота' });
    await createTask(customer.user.id, { status: 'published', publishedAt: new Date() });

    const res = await queue(moderator.cookie);

    expect(res.status).toBe(200);
    expect(res.body.items.map((i: { id: string }) => i.id)).toEqual([older.id, newer.id]);
    expect(Object.keys(res.body.items[0]).sort()).toEqual(
      ['createdAt', 'customer', 'deadlineAt', 'description', 'id', 'moderationReason', 'priceKopecks', 'status', 'title'],
    );
    expect(res.body.items[0].customer).toEqual({ id: customer.user.id, displayName: customer.user.displayName });
    expect((await queue(moderator.cookie, 'rejected')).body.items).toHaveLength(1);
    expect((await queue(moderator.cookie, 'published')).body.items).toHaveLength(1);
    expect((await queue(moderator.cookie, 'done')).body.error.code).toBe('VALIDATION_FAILED');
  });
});

describe('US-40 sc.3 a forged status at creation', () => {
  it('US-40 sc.3 POST /api/tasks with status "published", commission and executorId → 201, pending_moderation, no snapshot', async () => {
    const res = await api()
      .post('/api/tasks')
      .set('Cookie', customer.cookie)
      .set('Origin', ORIGIN)
      .send({
        title: 'Логотип для кав’ярні',
        description: 'Потрібен простий логотип.',
        priceKopecks: 40_000,
        deadlineAt: new Date(Date.now() + 7 * 24 * 3600_000).toISOString(),
        status: 'published',
        commissionKopecks: 1,
        commissionBp: 1,
        netKopecks: 39_999,
        executorId: student.user.id,
      });

    expect(res.status).toBe(201);
    expect(res.body.task.status).toBe('pending_moderation');
    expect(await prisma.task.findUniqueOrThrow({ where: { id: res.body.task.id } })).toMatchObject({
      status: 'pending_moderation',
      executorId: null,
      commissionBp: null,
      commissionKopecks: null,
      netKopecks: null,
      publishedAt: null,
    });
    expect(await feedIds(student.cookie)).toEqual([]);
  });
});

describe('US-40 access (INV-25)', () => {
  it('a student and a customer are 403 ROLE_FORBIDDEN, also with an invalid body; no session is 401', async () => {
    const task = await pendingTask();
    for (const who of [student, customer]) {
      for (const res of [await queue(who.cookie), await publish(task.id, who.cookie), await reject(task.id, {}, who.cookie)]) {
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('ROLE_FORBIDDEN');
      }
    }
    for (const res of [await queue(), await publish(task.id), await reject(task.id, { reason: 'x' })]) {
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_REQUIRED');
    }
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe('pending_moderation');
  });
});

describe('US-40 races (INV-24, ADR-0007)', () => {
  const settledStatuses = (results: PromiseSettledResult<{ status: number }>[]) =>
    results.map((r) => (r.status === 'fulfilled' ? r.value.status : -1)).sort();

  /**
   * INV-08 as a state check. A snapshot exists only for a task that went through publish; a `published` task always has it.
   * A task the owner cancels AFTER the publish (published → cancelled, A-08) keeps it: OQ-43 e. A task cancelled BEFORE the publish
   * never gets one, because the conditional write finds `cancelled` and the publish is 409.
   */
  async function expectSnapshotInvariant() {
    for (const row of await prisma.task.findMany()) {
      const parts = [row.commissionBp, row.commissionKopecks, row.netKopecks];
      expect(parts.every((p) => p !== null) || parts.every((p) => p === null)).toBe(true);
      if (row.status === 'published') expect(row.commissionBp).not.toBeNull();
      if (row.status === 'rejected' || row.status === 'pending_moderation') expect(row.commissionBp).toBeNull();
    }
  }

  it('publish + publish: one 200, one 409 ALREADY_DECIDED, one notification', async () => {
    const task = await pendingTask();
    const results = await Promise.allSettled([publish(task.id, moderator.cookie), publish(task.id, moderator.cookie)]);
    expect(settledStatuses(results)).toEqual([200, 409]);
    expect(await prisma.notification.count()).toBe(1);
    expect(await auditCount()).toBe(1);
    await expectSnapshotInvariant();
  });

  it('publish + reject: one 200, one 409 ALREADY_DECIDED, consistent final state', async () => {
    const task = await pendingTask();
    const results = await Promise.allSettled([publish(task.id, moderator.cookie), reject(task.id, { reason: 'x' }, moderator.cookie)]);
    expect(settledStatuses(results)).toEqual([200, 409]);
    expect(await prisma.notification.count()).toBe(1);
    await expectSnapshotInvariant();
  });

  it('publish against the owner\'s DELETE: the snapshot exists exactly when the publish answered 200; never published without one', async () => {
    for (let i = 0; i < 8; i += 1) {
      const task = await pendingTask();
      const [published, deleted] = await Promise.allSettled([publish(task.id, moderator.cookie), ownerDelete(task.id, customer.cookie)]);
      const publishStatus = published.status === 'fulfilled' ? published.value.status : -1;
      const deleteStatus = deleted.status === 'fulfilled' ? deleted.value.status : -1;
      const row = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });

      expect([200, 409]).toContain(publishStatus);
      expect(row.commissionBp !== null).toBe(publishStatus === 200);
      expect(row.status).toBe(deleteStatus === 204 ? 'cancelled' : 'published');
      if (publishStatus === 409) expect(deleteStatus).toBe(204); // the owner won: cancelled, no snapshot
    }
    await expectSnapshotInvariant();
  });
});

describe('US-40 rollback (testing.md §4)', () => {
  it.each(['publish', 'reject'] as const)('a failing notification insert on %s → 500 INTERNAL_ERROR, task untouched, no audit, no notification', async (action) => {
    const task = await pendingTask();
    vi.spyOn(notificationsRepo, 'insertNotification').mockRejectedValueOnce(new Error('injected failure'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const res = action === 'publish' ? await publish(task.id, moderator.cookie) : await reject(task.id, { reason: 'x' }, moderator.cookie);

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).toMatchObject({
      status: 'pending_moderation',
      commissionBp: null,
      commissionKopecks: null,
      netKopecks: null,
      publishedAt: null,
      moderationReason: null,
    });
    expect(await auditCount()).toBe(0);
    expect(await prisma.notification.count()).toBe(0);
  });
});
