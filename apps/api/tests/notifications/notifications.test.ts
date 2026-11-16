import { beforeEach, describe, expect, it } from 'vitest';
import { hashSessionId } from '../../src/modules/identity/domain';
import { notifyExecutorSelected } from '../../src/modules/notifications/service';
import { prisma as appPrisma } from '../../src/platform/db';
import { api } from '../helpers/app';
import { prisma, resetDb } from '../helpers/db';
import { createApplication, createTask, createUser } from '../helpers/factories';

const ORIGIN = 'http://localhost:5173';
let counter = 0;
async function loginAs(overrides: Record<string, unknown> = {}) {
  counter += 1;
  const user = await prisma.user.create({
    data: {
      email: `notif${counter}@university.edu.ua`,
      passwordHash: 'x',
      displayName: 'Олена Коваль',
      role: 'student',
      emailConfirmedAt: new Date(),
      studentVerifiedAt: new Date(),
      ...overrides,
    },
  });
  const sid = `notif-session-${counter}`;
  await prisma.session.create({ data: { id: hashSessionId(sid), userId: user.id, expiresAt: new Date(Date.now() + 3600_000) } });
  return { user, cookie: `sid=${sid}` };
}

const list = (cookie?: string, query = '') => {
  const req = api().get(`/api/me/notifications${query}`);
  return cookie ? req.set('Cookie', cookie) : req;
};
const markRead = (id: string, cookie?: string) => {
  const req = api().post(`/api/me/notifications/${id}/read`);
  return (cookie ? req.set('Cookie', cookie).set('Origin', ORIGIN) : req).send({});
};
const seed = (userId: string, overrides: Record<string, unknown> = {}) =>
  prisma.notification.create({
    data: { userId, type: 'executor_selected', payloadJson: JSON.stringify({ taskId: 't', taskTitle: 'Парсер сайту' }), ...overrides },
  });

let customerId: string;
beforeEach(async () => {
  await resetDb();
  customerId = (await createUser({ role: 'customer', email: 'owner@company.com' })).id;
});

describe('Notifications: US-21', () => {
  // The assign endpoint (US-25) does not exist yet, so the transaction it will run is written here (traceability W-08).
  it('US-21 sc.1 the executor gets «Вас обрано виконавцем завдання [Назва]» in the same transaction, unread', async () => {
    const { user, cookie } = await loginAs();
    const task = await createTask(customerId, { title: 'Парсер сайту' });
    const application = await createApplication(task.id, user.id);

    await appPrisma.$transaction(async (tx) => {
      await tx.application.updateMany({ where: { id: application.id, status: 'sent' }, data: { status: 'accepted' } });
      await notifyExecutorSelected(tx, user.id, { id: task.id, title: task.title });
    });
    const res = await list(cookie);

    expect(res.status).toBe(200);
    expect(res.body.notifications).toHaveLength(1);
    expect(res.body.notifications[0]).toMatchObject({
      type: 'executor_selected',
      text: 'Вас обрано виконавцем завдання Парсер сайту',
      payload: { taskId: task.id, taskTitle: 'Парсер сайту' },
      read: false,
    });
    expect(Object.keys(res.body.notifications[0]).sort()).toEqual(['createdAt', 'id', 'payload', 'read', 'text', 'type']);
  });

  it('US-21 sc.2 a failure after the notification rolls everything back: no notification, the application stays sent', async () => {
    const { user, cookie } = await loginAs();
    const task = await createTask(customerId);
    const application = await createApplication(task.id, user.id);

    await expect(
      appPrisma.$transaction(async (tx) => {
        await tx.application.updateMany({ where: { id: application.id, status: 'sent' }, data: { status: 'accepted' } });
        await notifyExecutorSelected(tx, user.id, { id: task.id, title: task.title });
        throw new Error('injected failure');
      }),
    ).rejects.toThrow('injected failure');

    expect(await prisma.notification.count()).toBe(0);
    expect((await prisma.application.findUniqueOrThrow({ where: { id: application.id } })).status).toBe('sent');
    expect((await list(cookie)).body.notifications).toEqual([]);
  });

  it('US-21 sc.3 an old unread notification is still listed, unread, when the student opens the centre later', async () => {
    const { user, cookie } = await loginAs();
    const hoursAgo = new Date(Date.now() - 5 * 3600_000);
    await seed(user.id, { id: 'n-old', createdAt: hoursAgo });

    const res = await list(cookie);

    expect(res.status).toBe(200);
    expect(res.body.notifications).toHaveLength(1);
    expect(res.body.notifications[0]).toMatchObject({ id: 'n-old', read: false, createdAt: hoursAgo.toISOString() });
  });

  it('US-21 sc.3 an old unread notification is listed first even when more newer read ones exist than the page limit', async () => {
    const { user, cookie } = await loginAs();
    await seed(user.id, { id: 'n-0000', createdAt: new Date(Date.now() - 48 * 3600_000) });
    for (let i = 1; i <= 30; i += 1) await seed(user.id, { id: `n-${String(100 + i)}`, readAt: new Date() });

    const res = await list(cookie);

    expect(res.status).toBe(200);
    expect(res.body.notifications[0]).toMatchObject({ id: 'n-0000', read: false });
    expect(res.body.notifications).toHaveLength(1 + 20); // the unread one, then the 20 newest read ones
    expect(res.body.notifications.slice(1).every((n: { read: boolean }) => n.read)).toBe(true);
    const small = await list(cookie, '?limit=5');
    expect(small.body.notifications).toHaveLength(1 + 5);
    expect(small.body.notifications[0].id).toBe('n-0000');
  });

  it('US-21 sc.3 marking it read keeps it listed as read, and repeating is a no-op 204', async () => {
    const { user, cookie } = await loginAs();
    await seed(user.id, { id: 'n-1' });

    expect((await markRead('n-1', cookie)).status).toBe(204);
    const once = await prisma.notification.findUniqueOrThrow({ where: { id: 'n-1' } });
    expect(once.readAt).not.toBeNull();
    expect((await markRead('n-1', cookie)).status).toBe(204);
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: 'n-1' } })).readAt?.getTime()).toBe(once.readAt?.getTime());
    expect((await list(cookie)).body.notifications[0].read).toBe(true);
  });

  it('US-21 a student sees only their own notifications, newest first, and ?after= gives only the newer ones', async () => {
    const { user, cookie } = await loginAs();
    const other = await loginAs();
    await seed(user.id, { id: 'n-001' });
    await seed(user.id, { id: 'n-002' });
    await seed(user.id, { id: 'n-003' });
    await seed(other.user.id, { id: 'n-999' });

    const all = await list(cookie);
    expect(all.body.notifications.map((n: { id: string }) => n.id)).toEqual(['n-003', 'n-002', 'n-001']);
    const newer = await list(cookie, '?after=n-001');
    expect(newer.body.notifications.map((n: { id: string }) => n.id)).toEqual(['n-003', 'n-002']);
    const none = await list(cookie, '?after=n-003');
    expect(none.body.notifications).toEqual([]);
  });

  it('US-21 another user\'s notification is 404 NOT_FOUND on mark-read and stays unread; so is an unknown id', async () => {
    const { cookie } = await loginAs();
    const other = await loginAs();
    await seed(other.user.id, { id: 'n-other' });

    const foreign = await markRead('n-other', cookie);
    expect(foreign.status).toBe(404);
    expect(foreign.body.error.code).toBe('NOT_FOUND');
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: 'n-other' } })).readAt).toBeNull();
    expect((await markRead('no-such-id', cookie)).status).toBe(404);
  });

  it('US-21 a bad limit is 400 VALIDATION_FAILED', async () => {
    const { cookie } = await loginAs();
    const res = await list(cookie, '?limit=0');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('US-21 no session is 401 AUTH_REQUIRED on both endpoints', async () => {
    expect((await list()).body.error.code).toBe('AUTH_REQUIRED');
    expect((await markRead('n-1')).status).toBe(401);
  });
});
