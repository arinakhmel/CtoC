import { beforeEach, describe, expect, it } from 'vitest';
import { hashSessionId } from '../../src/modules/identity/domain';
import { api } from '../helpers/app';
import { prisma, resetDb } from '../helpers/db';
import { createTask } from '../helpers/factories';

/**
 * US-49. The customer is told what the moderator decided about the task: published, or rejected with the reason. The trigger is
 * the decision of US-40 (`POST /api/mod/tasks/:id/publish` and `/reject`), which writes the notification in its own transaction
 * (INV-23); the rollback of that transaction is tested in `admin/mod-tasks.test.ts` (US-40). Here every scenario of US-49 is
 * asserted through the real endpoints and the notification centre of the customer.
 */

const ORIGIN = 'http://localhost:5173';
let counter = 0;
async function loginAs(role: 'student' | 'customer' | 'moderator') {
  counter += 1;
  const user = await prisma.user.create({
    data: {
      email: `modnote${counter}@${role === 'student' ? 'university.edu.ua' : 'company.com'}`,
      passwordHash: 'x',
      displayName: `Користувач ${counter}`,
      role,
      emailConfirmedAt: new Date(),
    },
  });
  const sid = `modnote-session-${counter}`;
  await prisma.session.create({ data: { id: hashSessionId(sid), userId: user.id, expiresAt: new Date(Date.now() + 3600_000) } });
  return { user, cookie: `sid=${sid}` };
}
type Login = Awaited<ReturnType<typeof loginAs>>;

const decide = (id: string, action: 'publish' | 'reject', cookie: string, body: object = {}) =>
  api().post(`/api/mod/tasks/${id}/${action}`).set('Cookie', cookie).set('Origin', ORIGIN).send(body);
const notificationsOf = (cookie: string) => api().get('/api/me/notifications').set('Cookie', cookie);

let moderator: Login;
let customer: Login;
let task: Awaited<ReturnType<typeof createTask>>;

beforeEach(async () => {
  await resetDb();
  moderator = await loginAs('moderator');
  customer = await loginAs('customer');
  task = await createTask(customer.user.id, { title: 'Парсер сайту', status: 'pending_moderation' });
});

describe('US-49 sc.1 published', () => {
  it('US-49 sc.1 the moderator publishes: the owner gets one unread «Ваше завдання «Парсер сайту» опубліковано», and nobody else does', async () => {
    const res = await decide(task.id, 'publish', moderator.cookie);

    expect(res.status).toBe(200);
    const list = await notificationsOf(customer.cookie);
    expect(list.status).toBe(200);
    expect(list.body.notifications).toHaveLength(1);
    expect(list.body.notifications[0]).toMatchObject({
      type: 'task_published',
      text: 'Ваше завдання «Парсер сайту» опубліковано',
      payload: { taskId: task.id, taskTitle: 'Парсер сайту' },
      read: false,
    });
    const otherCustomer = await loginAs('customer');
    const student = await loginAs('student');
    expect((await notificationsOf(otherCustomer.cookie)).body.notifications).toEqual([]);
    expect((await notificationsOf(student.cookie)).body.notifications).toEqual([]);
    expect((await notificationsOf(moderator.cookie)).body.notifications).toEqual([]);
  });
});

describe('US-49 sc.2 rejected with a reason', () => {
  it('US-49 sc.2 the moderator rejects with a reason: the owner gets «Ваше завдання «Парсер сайту» відхилено. Причина: [причина]»', async () => {
    const res = await decide(task.id, 'reject', moderator.cookie, { reason: 'Це університетська лабораторна' });

    expect(res.status).toBe(200);
    const list = await notificationsOf(customer.cookie);
    expect(list.body.notifications).toHaveLength(1);
    expect(list.body.notifications[0]).toMatchObject({
      type: 'task_rejected',
      text: 'Ваше завдання «Парсер сайту» відхилено. Причина: Це університетська лабораторна',
      payload: { taskId: task.id, taskTitle: 'Парсер сайту', reason: 'Це університетська лабораторна' },
      read: false,
    });
  });

  it('US-49 sc.2 the reason is trimmed and the same text is shown for the Cyrillic and emoji reason', async () => {
    await decide(task.id, 'reject', moderator.cookie, { reason: '  Домашнє завдання 📚  ' });

    const text = (await notificationsOf(customer.cookie)).body.notifications[0].text;
    expect(text).toBe('Ваше завдання «Парсер сайту» відхилено. Причина: Домашнє завдання 📚');
  });
});

describe('US-49 sc.3 rejected without a reason', () => {
  it.each([['no reason', {}], ['an empty reason', { reason: '' }], ['only spaces', { reason: '   ' }]])(
    'US-49 sc.3 %s: 400 REASON_REQUIRED, the task stays pending_moderation and no notification is created',
    async (_name, body) => {
      const res = await decide(task.id, 'reject', moderator.cookie, body);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('REASON_REQUIRED');
      expect(res.body.error.message).toBe('Вкажіть причину відхилення');
      expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe('pending_moderation');
      expect(await prisma.notification.count()).toBe(0);
      expect((await notificationsOf(customer.cookie)).body.notifications).toEqual([]);
    },
  );
});

describe('US-49 checklist: one decision, one notification', () => {
  it('US-49 a second decision is 409 ALREADY_DECIDED and adds no notification', async () => {
    expect((await decide(task.id, 'publish', moderator.cookie)).status).toBe(200);

    const again = await decide(task.id, 'publish', moderator.cookie);
    const reject = await decide(task.id, 'reject', moderator.cookie, { reason: 'пізно' });

    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ALREADY_DECIDED');
    expect(reject.status).toBe(409);
    expect(await prisma.notification.count()).toBe(1);
  });

  it('US-49 a student and a customer cannot decide: 403 ROLE_FORBIDDEN and no notification', async () => {
    const student = await loginAs('student');

    expect((await decide(task.id, 'publish', student.cookie)).status).toBe(403);
    const byOwner = await decide(task.id, 'reject', customer.cookie, { reason: 'сам себе' });

    expect(byOwner.status).toBe(403);
    expect(byOwner.body.error.code).toBe('ROLE_FORBIDDEN');
    expect(await prisma.notification.count()).toBe(0);
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe('pending_moderation');
  });
});
