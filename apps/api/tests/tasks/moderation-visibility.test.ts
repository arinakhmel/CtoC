import { beforeEach, describe, expect, it } from 'vitest';
import { hashSessionId } from '../../src/modules/identity/domain';
import { api } from '../helpers/app';
import { prisma, resetDb } from '../helpers/db';
import { createTask, createUser } from '../helpers/factories';

/**
 * US-14. Only moderated tasks reach students (INV-06). The publish and reject endpoints belong to US-40, so these
 * tests put the task rows into the states those endpoints produce.
 */

let counter = 0;
async function loginAs() {
  counter += 1;
  const user = await prisma.user.create({
    data: {
      email: `modvis${counter}@university.edu.ua`,
      passwordHash: 'x',
      displayName: 'Олена Коваль',
      role: 'student',
      emailConfirmedAt: new Date(),
    },
  });
  const sid = `modvis-session-${counter}`;
  await prisma.session.create({ data: { id: hashSessionId(sid), userId: user.id, expiresAt: new Date(Date.now() + 3600_000) } });
  return { user, cookie: `sid=${sid}` };
}

let customerId: string;
const feedIds = async (cookie: string) => {
  const res = await api().get('/api/tasks').set('Cookie', cookie);
  expect(res.status).toBe(200);
  return res.body.tasks.map((t: { id: string }) => t.id) as string[];
};
const getTask = (id: string, cookie: string) => api().get(`/api/tasks/${id}`).set('Cookie', cookie);

beforeEach(async () => {
  await resetDb();
  customerId = (await createUser({ role: 'customer', email: 'owner@company.com' })).id;
});

describe('US-14 sc.1 a task that passed moderation', () => {
  it('US-14 sc.1 a published task is in the feed and can be opened', async () => {
    const { cookie } = await loginAs();
    const task = await createTask(customerId, { status: 'published', publishedAt: new Date() });

    expect(await feedIds(cookie)).toEqual([task.id]);
    const res = await getTask(task.id, cookie);
    expect(res.status).toBe(200);
    expect(res.body.task.id).toBe(task.id);
  });
});

describe('US-14 sc.2 a task waiting for moderation', () => {
  it('US-14 sc.2 a pending_moderation task is absent from the feed', async () => {
    const { cookie } = await loginAs();
    const visible = await createTask(customerId, { status: 'published', publishedAt: new Date() });
    await createTask(customerId, { status: 'pending_moderation', publishedAt: null });

    expect(await feedIds(cookie)).toEqual([visible.id]);
  });

  it('US-14 sc.2 GET /:id of a pending_moderation task is 404 NOT_FOUND, the same as an unknown id', async () => {
    const { cookie } = await loginAs();
    const pending = await createTask(customerId, { status: 'pending_moderation', publishedAt: null });

    const res = await getTask(pending.id, cookie);
    const unknown = await getTask('00000000-0000-0000-0000-000000000000', cookie);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body).toEqual(unknown.body);
  });
});

describe('US-14 sc.3 a task rejected by the moderator', () => {
  it('US-14 sc.3 a rejected task never appears in the feed and GET /:id is 404 NOT_FOUND', async () => {
    const { cookie } = await loginAs();
    const rejected = await createTask(customerId, {
      status: 'rejected',
      publishedAt: null,
      moderationReason: 'Схоже на домашнє завдання',
    });

    expect(await feedIds(cookie)).toEqual([]);
    const res = await getTask(rejected.id, cookie);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('US-14 sc.3 a published task that is rejected later (G-17) leaves the feed and the details', async () => {
    const { cookie } = await loginAs();
    const task = await createTask(customerId, { status: 'published', publishedAt: new Date() });
    expect(await feedIds(cookie)).toEqual([task.id]);

    await prisma.task.update({ where: { id: task.id }, data: { status: 'rejected', moderationReason: 'Домашня робота' } });

    expect(await feedIds(cookie)).toEqual([]);
    expect((await getTask(task.id, cookie)).status).toBe(404);
  });
});
