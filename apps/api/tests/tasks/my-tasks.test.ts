import { beforeEach, describe, expect, it } from 'vitest';
import { hashSessionId } from '../../src/modules/identity/domain';
import { prisma as appPrisma } from '../../src/platform/db';
import { api } from '../helpers/app';
import { prisma, resetDb } from '../helpers/db';
import { createApplication, createTask } from '../helpers/factories';

/**
 * US-50. «Мої завдання»: `GET /api/my/tasks`, the management page of one task (`GET /api/tasks/:id/applications`) and the delete
 * before an executor is chosen (`DELETE /api/tasks/:id`, which also rejects the applications of the task, A-14).
 */

const ORIGIN = 'http://localhost:5173';
let counter = 0;
async function loginAs(role: 'student' | 'customer', overrides: Record<string, unknown> = {}) {
  counter += 1;
  const user = await prisma.user.create({
    data: {
      email: `mytasks${counter}@${role === 'student' ? 'university.edu.ua' : 'company.com'}`,
      passwordHash: 'x',
      displayName: `Користувач ${counter}`,
      role,
      emailConfirmedAt: new Date(),
      studentVerifiedAt: role === 'student' ? new Date() : null,
      ...overrides,
    },
  });
  const sid = `mytasks-session-${counter}`;
  await prisma.session.create({ data: { id: hashSessionId(sid), userId: user.id, expiresAt: new Date(Date.now() + 3600_000) } });
  return { user, cookie: `sid=${sid}` };
}
type Login = Awaited<ReturnType<typeof loginAs>>;

const myTasks = (cookie?: string) => (cookie ? api().get('/api/my/tasks').set('Cookie', cookie) : api().get('/api/my/tasks'));
const manage = (taskId: string, cookie: string) => api().get(`/api/tasks/${taskId}/applications`).set('Cookie', cookie);
const del = (taskId: string, cookie: string) => api().delete(`/api/tasks/${taskId}`).set('Cookie', cookie).set('Origin', ORIGIN);
const feedIds = async (cookie: string) => ((await api().get('/api/tasks').set('Cookie', cookie)).body.tasks as { id: string }[]).map((t) => t.id);
type Row = { id: string; title: string; status: string; priceKopecks: number; deadlineAt: string; applicationsCount: number };

let owner: Login;
beforeEach(async () => {
  await resetDb();
  owner = await loginAs('customer');
});

describe('US-50 sc.1 the list of my tasks', () => {
  it('US-50 sc.1 three tasks (pending_moderation, published, done) are listed with status, price, deadline and the number of applications', async () => {
    const deadline = new Date(Date.now() + 7 * 24 * 3600_000);
    const pending = await createTask(owner.user.id, { title: 'Логотип', status: 'pending_moderation', priceKopecks: 30_000, deadlineAt: deadline, createdAt: new Date(Date.now() - 3000) });
    const published = await createTask(owner.user.id, { title: 'Парсер сайту', status: 'published', priceKopecks: 50_000, deadlineAt: deadline, publishedAt: new Date(), createdAt: new Date(Date.now() - 2000) });
    const executor = await loginAs('student');
    const done = await createTask(owner.user.id, { title: 'Банер', status: 'done', executorId: executor.user.id, priceKopecks: 70_000, deadlineAt: deadline, createdAt: new Date(Date.now() - 1000) });
    const first = await loginAs('student');
    const second = await loginAs('student');
    await createApplication(published.id, first.user.id);
    await createApplication(published.id, second.user.id);

    const res = await myTasks(owner.cookie);

    expect(res.status).toBe(200);
    const rows = res.body.tasks as Row[];
    expect(rows.map((r) => r.id)).toEqual([done.id, published.id, pending.id]); // newest first
    expect(rows.find((r) => r.id === pending.id)).toEqual({
      id: pending.id,
      title: 'Логотип',
      priceKopecks: 30_000,
      deadlineAt: deadline.toISOString(),
      status: 'pending_moderation',
      applicationsCount: 0,
    });
    expect(rows.find((r) => r.id === published.id)).toMatchObject({ status: 'published', priceKopecks: 50_000, applicationsCount: 2 });
    expect(rows.find((r) => r.id === done.id)).toMatchObject({ status: 'done', priceKopecks: 70_000 });
    expect(Object.keys(rows[0]!).sort()).toEqual(['applicationsCount', 'deadlineAt', 'id', 'priceKopecks', 'status', 'title']);
  });

  it('US-50 sc.1 every status is listed, also rejected and cancelled', async () => {
    const executor = await loginAs('student');
    const withExecutor = ['in_progress', 'in_review', 'revision', 'done']; // the database requires an executor from assignment on
    for (const status of ['pending_moderation', 'published', 'rejected', 'in_progress', 'in_review', 'revision', 'done', 'cancelled']) {
      await createTask(owner.user.id, withExecutor.includes(status) ? { status, executorId: executor.user.id, assignedAt: new Date() } : { status });
    }

    const rows = (await myTasks(owner.cookie)).body.tasks as Row[];

    expect(rows.map((r) => r.status).sort()).toEqual(['cancelled', 'done', 'in_progress', 'in_review', 'pending_moderation', 'published', 'rejected', 'revision']);
  });

  it('US-50 sc.1 a customer with no task gets an empty list', async () => {
    const res = await myTasks(owner.cookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ tasks: [] });
  });

  it('US-50 access: a student is 403 ROLE_FORBIDDEN and no session is 401', async () => {
    const student = await loginAs('student');
    expect((await myTasks(student.cookie)).status).toBe(403);
    expect((await myTasks(student.cookie)).body.error.code).toBe('ROLE_FORBIDDEN');
    const none = await myTasks();
    expect(none.status).toBe(401);
    expect(none.body.error.code).toBe('AUTH_REQUIRED');
  });
});

describe("US-50 sc.2 another customer's task", () => {
  it('US-50 sc.2 the management page of a task of another customer is 404 NOT_FOUND, the same as an unknown id, and nothing leaks', async () => {
    const other = await loginAs('customer');
    const task = await createTask(other.user.id, { title: 'Чужа задача', status: 'published', publishedAt: new Date() });
    const student = await loginAs('student');
    await createApplication(task.id, student.user.id);

    const foreign = await manage(task.id, owner.cookie);
    const unknown = await manage('no-such-task', owner.cookie);

    expect(foreign.status).toBe(404);
    expect(foreign.body.error.code).toBe('NOT_FOUND');
    expect(foreign.body).toEqual(unknown.body);
    expect(JSON.stringify(foreign.body)).not.toContain('Чужа задача');
    expect(JSON.stringify(foreign.body)).not.toContain(student.user.id);
  });

  it('US-50 sc.2 my list holds only my tasks, never those of another customer', async () => {
    const other = await loginAs('customer');
    await createTask(other.user.id, { title: 'Чужа задача', status: 'published', publishedAt: new Date() });
    const mine = await createTask(owner.user.id, { title: 'Моя задача' });

    const rows = (await myTasks(owner.cookie)).body.tasks as Row[];

    expect(rows.map((r) => r.id)).toEqual([mine.id]);
    expect(JSON.stringify(rows)).not.toContain('Чужа задача');
  });
});

describe('US-50 sc.3 delete before an executor is chosen', () => {
  async function publishedWithApplications() {
    const task = await createTask(owner.user.id, { title: 'Парсер сайту', status: 'published', publishedAt: new Date() });
    const student = await loginAs('student');
    const first = await createApplication(task.id, (await loginAs('student')).user.id);
    const second = await createApplication(task.id, (await loginAs('student')).user.id);
    return { task, student, first, second };
  }

  it('US-50 sc.3 deleting a published task with applications: 204, cancelled, out of the feed, every application rejected', async () => {
    const { task, student, first, second } = await publishedWithApplications();
    expect(await feedIds(student.cookie)).toEqual([task.id]);

    const res = await del(task.id, owner.cookie);

    expect(res.status).toBe(204);
    const row = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(row.status).toBe('cancelled');
    expect(row.cancelledAt).not.toBeNull();
    expect(await feedIds(student.cookie)).toEqual([]);
    const apps = await prisma.application.findMany({ where: { id: { in: [first.id, second.id] } } });
    expect(apps.map((a) => a.status)).toEqual(['rejected', 'rejected']);
    expect(apps.every((a) => a.decidedAt !== null)).toBe(true);
    expect(((await myTasks(owner.cookie)).body.tasks as Row[])[0]).toMatchObject({ id: task.id, status: 'cancelled' });
  });

  it('US-50 sc.3 after an executor is chosen the delete is 409 TASK_HAS_EXECUTOR and the applications are not changed', async () => {
    const task = await createTask(owner.user.id, { status: 'published', publishedAt: new Date() });
    const chosen = await loginAs('student');
    const other = await loginAs('student');
    const accepted = await createApplication(task.id, chosen.user.id, { status: 'accepted' });
    const rejected = await createApplication(task.id, other.user.id, { status: 'rejected' });
    await prisma.task.update({ where: { id: task.id }, data: { status: 'in_progress', executorId: chosen.user.id, assignedAt: new Date() } });

    const res = await del(task.id, owner.cookie);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TASK_HAS_EXECUTOR');
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe('in_progress');
    expect((await prisma.application.findUniqueOrThrow({ where: { id: accepted.id } })).status).toBe('accepted');
    expect((await prisma.application.findUniqueOrThrow({ where: { id: rejected.id } })).status).toBe('rejected');
  });

  it('US-50 sc.3 a task on moderation can be deleted too, and a task of another customer is 403 NOT_TASK_OWNER and stays', async () => {
    const pending = await createTask(owner.user.id, { status: 'pending_moderation' });
    const other = await loginAs('customer');
    const foreign = await createTask(other.user.id, { status: 'published', publishedAt: new Date() });
    const student = await loginAs('student');
    const application = await createApplication(foreign.id, student.user.id);

    expect((await del(pending.id, owner.cookie)).status).toBe(204);
    const refused = await del(foreign.id, owner.cookie);

    expect(refused.status).toBe(403);
    expect(refused.body.error.code).toBe('NOT_TASK_OWNER');
    expect((await prisma.task.findUniqueOrThrow({ where: { id: foreign.id } })).status).toBe('published');
    expect((await prisma.application.findUniqueOrThrow({ where: { id: application.id } })).status).toBe('sent');
  });

  it('US-50 rollback: a failure while the applications are rejected is 500 and the task is not cancelled', async () => {
    const { task, first, second } = await publishedWithApplications();
    const original = appPrisma.$transaction;
    appPrisma.$transaction = ((fn: (tx: object) => unknown, options?: unknown) =>
      (original as (...a: unknown[]) => unknown).call(
        appPrisma,
        (tx: object) =>
          fn(
            new Proxy(tx, {
              get(target, prop) {
                if (prop === 'application') return { updateMany: () => Promise.reject(new Error('injected failure')) };
                return Reflect.get(target, prop, target);
              },
            }),
          ),
        options,
      )) as never;
    let res;
    try {
      res = await del(task.id, owner.cookie);
    } finally {
      appPrisma.$transaction = original;
    }

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    const row = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(row.status).toBe('published');
    expect(row.cancelledAt).toBeNull();
    const apps = await prisma.application.findMany({ where: { id: { in: [first.id, second.id] } } });
    expect(apps.map((a) => a.status)).toEqual(['sent', 'sent']);
  });

  it('US-50 race: two deletes of one task at once give one 204 and one 409, and the applications are rejected once', async () => {
    const { task } = await publishedWithApplications();

    const results = await Promise.all([del(task.id, owner.cookie), del(task.id, owner.cookie)]);

    expect(results.map((r) => r.status).sort()).toEqual([204, 409]);
    expect(results.find((r) => r.status === 409)!.body.error.code).toBe('INVALID_TRANSITION');
    expect(await prisma.application.count({ where: { taskId: task.id, status: 'rejected' } })).toBe(2);
  });
});
