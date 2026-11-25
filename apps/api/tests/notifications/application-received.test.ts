import { beforeEach, describe, expect, it } from 'vitest';
import { hashSessionId } from '../../src/modules/identity/domain';
import { prisma as appPrisma } from '../../src/platform/db';
import { api } from '../helpers/app';
import { prisma, resetDb } from '../helpers/db';
import { createTask } from '../helpers/factories';

/** US-47. The owner of a task is told about a new application, in the transaction of the application (INV-23). */

const ORIGIN = 'http://localhost:5173';
const TEXT = 'Новий відгук на завдання «Парсер сайту»';

let counter = 0;
async function loginAs(role: 'student' | 'customer', overrides: Record<string, unknown> = {}) {
  counter += 1;
  const user = await prisma.user.create({
    data: {
      email: `appnote${counter}@${role === 'student' ? 'university.edu.ua' : 'company.com'}`,
      passwordHash: 'x',
      displayName: `Користувач ${counter}`,
      role,
      emailConfirmedAt: new Date(),
      studentVerifiedAt: role === 'student' ? new Date() : null,
      ...overrides,
    },
  });
  const sid = `appnote-session-${counter}`;
  await prisma.session.create({ data: { id: hashSessionId(sid), userId: user.id, expiresAt: new Date(Date.now() + 3600_000) } });
  return { user, cookie: `sid=${sid}` };
}

const apply = (taskId: string, cookie: string) =>
  api().post(`/api/tasks/${taskId}/applications`).set('Cookie', cookie).set('Origin', ORIGIN).send({});
const notificationsOf = (cookie: string) => api().get('/api/me/notifications').set('Cookie', cookie);

let owner: Awaited<ReturnType<typeof loginAs>>;
let task: Awaited<ReturnType<typeof createTask>>;

beforeEach(async () => {
  await resetDb();
  owner = await loginAs('customer');
  task = await createTask(owner.user.id, { title: 'Парсер сайту', publishedAt: new Date() });
});

describe('US-47 «Новий відгук на завдання»', () => {
  it('US-47 sc.1 a verified student applies: the owner gets one unread notification with the title, and nobody else does', async () => {
    const student = await loginAs('student');

    const res = await apply(task.id, student.cookie);

    expect(res.status).toBe(201);
    const rows = await prisma.notification.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: owner.user.id, type: 'application_received', readAt: null });

    const list = await notificationsOf(owner.cookie);
    expect(list.status).toBe(200);
    expect(list.body.notifications).toHaveLength(1);
    expect(list.body.notifications[0]).toMatchObject({
      type: 'application_received',
      text: TEXT,
      payload: { taskId: task.id, taskTitle: 'Парсер сайту' },
      read: false,
    });
    expect((await notificationsOf(student.cookie)).body.notifications).toEqual([]);
    const other = await loginAs('customer');
    expect((await notificationsOf(other.cookie)).body.notifications).toEqual([]);
  });

  it('US-47 sc.1 every new applicant makes their own notification', async () => {
    const first = await loginAs('student');
    const second = await loginAs('student');

    await apply(task.id, first.cookie);
    await apply(task.id, second.cookie);

    expect((await notificationsOf(owner.cookie)).body.notifications).toHaveLength(2);
  });

  it('US-47 sc.2 a repeated application is 409 ALREADY_APPLIED and creates no second notification', async () => {
    const student = await loginAs('student');
    expect((await apply(task.id, student.cookie)).status).toBe(201);

    const again = await apply(task.id, student.cookie);

    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ALREADY_APPLIED');
    expect(await prisma.application.count()).toBe(1);
    expect(await prisma.notification.count()).toBe(1);
    expect((await notificationsOf(owner.cookie)).body.notifications).toHaveLength(1);
  });

  it('US-47 sc.2 an application that is refused creates no notification: not verified, a customer, a task that left the feed', async () => {
    const unverified = await loginAs('student', { studentVerifiedAt: null });
    const customer = await loginAs('customer');
    const student = await loginAs('student');
    const unpublished = await createTask(owner.user.id, { status: 'pending_moderation', publishedAt: null });

    expect((await apply(task.id, unverified.cookie)).status).toBe(403);
    expect((await apply(task.id, customer.cookie)).status).toBe(403);
    expect((await apply(unpublished.id, student.cookie)).status).toBe(404);

    expect(await prisma.notification.count()).toBe(0);
  });

  it('US-47 sc.3 the owner was away: the notification is in the list, unread, when they open the centre later', async () => {
    const student = await loginAs('student');
    // The owner has no session while the student applies, and comes back with a new one.
    await prisma.session.deleteMany({ where: { userId: owner.user.id } });
    await apply(task.id, student.cookie);
    await prisma.session.create({ data: { id: hashSessionId('owner-back'), userId: owner.user.id, expiresAt: new Date(Date.now() + 3600_000) } });

    const list = await notificationsOf('sid=owner-back');

    expect(list.status).toBe(200);
    expect(list.body.notifications.map((n: { type: string; read: boolean }) => [n.type, n.read])).toEqual([['application_received', false]]);
  });

  it('US-47 sc.3 an old unread notification is not pushed out by newer read ones', async () => {
    const student = await loginAs('student');
    await apply(task.id, student.cookie);
    const old = await prisma.notification.findFirstOrThrow();
    for (let i = 0; i < 25; i += 1) {
      await prisma.notification.create({
        data: { userId: owner.user.id, type: 'result_submitted', payloadJson: JSON.stringify({ taskId: task.id, taskTitle: 'x' }), readAt: new Date() },
      });
    }

    const list = await notificationsOf(owner.cookie);

    expect(list.body.notifications[0]).toMatchObject({ id: old.id, type: 'application_received', read: false });
  });

  it('US-47 rollback: a failure at the notification insert is 500 INTERNAL_ERROR and no application is left', async () => {
    const student = await loginAs('student');
    const original = appPrisma.$transaction;
    appPrisma.$transaction = ((fn: (tx: object) => unknown, options?: unknown) =>
      (original as (...a: unknown[]) => unknown).call(
        appPrisma,
        (tx: object) =>
          fn(
            new Proxy(tx, {
              get(target, prop) {
                if (prop === 'notification') return { create: () => Promise.reject(new Error('injected failure')) };
                return Reflect.get(target, prop, target);
              },
            }),
          ),
        options,
      )) as never;
    let res;
    try {
      res = await apply(task.id, student.cookie);
    } finally {
      appPrisma.$transaction = original;
    }

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(await prisma.application.count()).toBe(0);
    expect(await prisma.notification.count()).toBe(0);
  });
});
