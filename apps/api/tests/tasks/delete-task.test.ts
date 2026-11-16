import { beforeEach, describe, expect, it } from 'vitest';
import { hashSessionId } from '../../src/modules/identity/domain';
import { prisma as appPrisma } from '../../src/platform/db';
import { api } from '../helpers/app';
import { prisma, resetDb } from '../helpers/db';
import { createTask } from '../helpers/factories';

const ORIGIN = 'http://localhost:5173';
let counter = 0;
async function loginAs(role: 'student' | 'customer', overrides: Record<string, unknown> = {}) {
  counter += 1;
  const user = await prisma.user.create({
    data: {
      email: `del${counter}@${role === 'student' ? 'university.edu.ua' : 'company.com'}`,
      passwordHash: 'x',
      displayName: 'Користувач',
      role,
      emailConfirmedAt: new Date(),
      studentVerifiedAt: role === 'student' ? new Date() : null,
      ...overrides,
    },
  });
  const sid = `del-session-${counter}`;
  await prisma.session.create({ data: { id: hashSessionId(sid), userId: user.id, expiresAt: new Date(Date.now() + 3600_000) } });
  return { user, cookie: `sid=${sid}` };
}

const del = (id: string, cookie?: string) => {
  const req = api().delete(`/api/tasks/${id}`);
  return cookie ? req.set('Cookie', cookie).set('Origin', ORIGIN) : req;
};
const statusOf = async (id: string) => (await prisma.task.findUniqueOrThrow({ where: { id } })).status;

beforeEach(async () => {
  await resetDb();
});

describe('DELETE /api/tasks/:id: US-22', () => {
  // The assign endpoint (US-25) does not exist yet, so the executor is a seeded row (traceability W-09).
  it('US-22 sc.2 deleting a task after an executor is assigned is 409 TASK_HAS_EXECUTOR and nothing changes', async () => {
    const owner = await loginAs('customer');
    const student = await loginAs('student');
    const task = await createTask(owner.user.id, { status: 'in_progress', executorId: student.user.id, publishedAt: new Date(), assignedAt: new Date() });

    const res = await del(task.id, owner.cookie);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TASK_HAS_EXECUTOR');
    const row = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(row.status).toBe('in_progress');
    expect(row.executorId).toBe(student.user.id);
  });

  it('US-22 sc.2 an owner cancels a task without an executor: 204, status cancelled and cancelled_at is set', async () => {
    const owner = await loginAs('customer');
    const task = await createTask(owner.user.id, { publishedAt: new Date() });
    const before = Date.now();

    const res = await del(task.id, owner.cookie);

    expect(res.status).toBe(204);
    const row = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(row.status).toBe('cancelled');
    expect(row.cancelledAt?.getTime()).toBeGreaterThanOrEqual(before - 1000);
  });

  // INV-13 race: an executor is set after the owner's task was read and before the cancelling update (assign, US-25, will do this).
  // The client is patched by hand and put back in `finally`: `vi.spyOn` does not restore a Prisma client method.
  it('US-22 sc.2 an executor assigned between the read and the update is still 409 TASK_HAS_EXECUTOR and the task is not cancelled', async () => {
    const owner = await loginAs('customer');
    const student = await loginAs('student');
    const task = await createTask(owner.user.id, { status: 'published' });
    const original = appPrisma.$transaction;
    appPrisma.$transaction = (async (...args: unknown[]) => {
      appPrisma.$transaction = original;
      await prisma.task.update({ where: { id: task.id }, data: { status: 'in_progress', executorId: student.user.id, assignedAt: new Date() } });
      return (original as (...a: unknown[]) => unknown).apply(appPrisma, args);
    }) as never;
    let res;
    try {
      res = await del(task.id, owner.cookie);
    } finally {
      appPrisma.$transaction = original;
    }

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TASK_HAS_EXECUTOR');
    const row = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(row.status).toBe('in_progress');
    expect(row.executorId).toBe(student.user.id);
  });

  it.each([['published'], ['pending_moderation']])('US-22 sc.2 a %s task with no executor is cancelled by its owner: 204', async (status) => {
    const owner = await loginAs('customer');
    const task = await createTask(owner.user.id, { status, publishedAt: status === 'published' ? new Date() : null });

    const res = await del(task.id, owner.cookie);

    expect(res.status).toBe(204);
    expect(await statusOf(task.id)).toBe('cancelled');
  });

  it('US-22 sc.2 a task in a state that cannot be cancelled (rejected, already cancelled) is 409 INVALID_TRANSITION', async () => {
    const owner = await loginAs('customer');
    const rejected = await createTask(owner.user.id, { status: 'rejected', publishedAt: null, moderationReason: 'Це домашнє завдання' });
    const cancelled = await createTask(owner.user.id, { status: 'cancelled', publishedAt: null });

    for (const task of [rejected, cancelled]) {
      const res = await del(task.id, owner.cookie);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('INVALID_TRANSITION');
    }
    expect(await statusOf(rejected.id)).toBe('rejected');
  });

  it("US-22 sc.2 another customer's task is 403 NOT_TASK_OWNER and stays as it was", async () => {
    const owner = await loginAs('customer');
    const other = await loginAs('customer');
    const task = await createTask(owner.user.id);

    const res = await del(task.id, other.cookie);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NOT_TASK_OWNER');
    expect(await statusOf(task.id)).toBe('published');
  });

  it('US-22 sc.2 a student is 403 ROLE_FORBIDDEN, no session is 401, an unknown id is 404', async () => {
    const owner = await loginAs('customer');
    const student = await loginAs('student');
    const task = await createTask(owner.user.id);

    expect((await del(task.id, student.cookie)).body.error.code).toBe('ROLE_FORBIDDEN');
    expect((await del(task.id)).status).toBe(401);
    const unknown = await del('no-such-task', owner.cookie);
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.code).toBe('NOT_FOUND');
    expect(await statusOf(task.id)).toBe('published');
  });
});
