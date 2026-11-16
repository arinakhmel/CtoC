import { beforeEach, describe, expect, it } from 'vitest';
import { hashSessionId } from '../../src/modules/identity/domain';
import { prisma as appPrisma } from '../../src/platform/db';
import { api } from '../helpers/app';
import { prisma, resetDb } from '../helpers/db';
import { createTask } from '../helpers/factories';

const ORIGIN = 'http://localhost:5173';
let counter = 0;
async function loginAs(role: 'student' | 'customer') {
  counter += 1;
  const user = await prisma.user.create({
    data: {
      email: `chat${counter}@${role === 'student' ? 'university.edu.ua' : 'company.com'}`,
      passwordHash: 'x',
      displayName: 'Користувач',
      role,
      emailConfirmedAt: new Date(),
      studentVerifiedAt: role === 'student' ? new Date() : null,
    },
  });
  const sid = `chat-session-${counter}`;
  await prisma.session.create({ data: { id: hashSessionId(sid), userId: user.id, expiresAt: new Date(Date.now() + 3600_000) } });
  return { user, cookie: `sid=${sid}` };
}

const list = (taskId: string, cookie?: string, query = '') => {
  const req = api().get(`/api/tasks/${taskId}/messages${query}`);
  return cookie ? req.set('Cookie', cookie) : req;
};
const post = (taskId: string, body: unknown, cookie?: string) => {
  const req = api().post(`/api/tasks/${taskId}/messages`);
  return (cookie ? req.set('Cookie', cookie).set('Origin', ORIGIN) : req).send(body as object);
};

let customer: Awaited<ReturnType<typeof loginAs>>;
let student: Awaited<ReturnType<typeof loginAs>>;
// The assign endpoint (US-25) does not exist yet, so a task with an executor is a seeded row (traceability W-09).
const activeTask = (overrides: Record<string, unknown> = {}) =>
  createTask(customer.user.id, { status: 'in_progress', executorId: student.user.id, publishedAt: new Date(), assignedAt: new Date(), ...overrides });

beforeEach(async () => {
  await resetDb();
  customer = await loginAs('customer');
  student = await loginAs('student');
});

describe('Chat: US-23', () => {
  it('US-23 sc.1 the student sends a message: 201, and the customer sees it on the next poll', async () => {
    const task = await activeTask();

    const sent = await post(task.id, { body: 'Добрий день! Уточніть, будь ласка, формат файлів.' }, student.cookie);
    expect(sent.status).toBe(201);
    expect(sent.body.message).toMatchObject({ body: 'Добрий день! Уточніть, будь ласка, формат файлів.', mine: true, from: 'executor' });
    expect(Object.keys(sent.body.message).sort()).toEqual(['body', 'createdAt', 'from', 'id', 'mine']);

    const seen = await list(task.id, customer.cookie);
    expect(seen.status).toBe(200);
    expect(seen.body.messages).toHaveLength(1);
    expect(seen.body.messages[0]).toMatchObject({ id: sent.body.message.id, mine: false, from: 'executor' });
  });

  it('US-23 sc.1 sending a message does not change the task (its updatedAt stays as it was)', async () => {
    const task = await activeTask();
    const before = (await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).updatedAt;

    expect((await post(task.id, { body: 'Привіт' }, student.cookie)).status).toBe(201);
    expect((await post(task.id, { body: 'Ще одне' }, customer.cookie)).status).toBe(201);

    const after = (await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).updatedAt;
    expect(after.getTime()).toBe(before.getTime());
  });

  it('US-23 sc.1 the customer answers; the list is oldest first and ?after= returns only the newer messages', async () => {
    const task = await activeTask();
    await prisma.message.create({ data: { id: 'm-001', taskId: task.id, senderId: student.user.id, body: 'Перше' } });
    await prisma.message.create({ data: { id: 'm-002', taskId: task.id, senderId: customer.user.id, body: 'Друге' } });
    await prisma.message.create({ data: { id: 'm-003', taskId: task.id, senderId: student.user.id, body: 'Третє' } });

    const all = await list(task.id, student.cookie);
    expect(all.body.messages.map((m: { body: string }) => m.body)).toEqual(['Перше', 'Друге', 'Третє']);
    expect(all.body.messages.map((m: { mine: boolean }) => m.mine)).toEqual([true, false, true]);
    expect(all.body.messages[1].from).toBe('customer');
    const newer = await list(task.id, customer.cookie, '?after=m-001');
    expect(newer.body.messages.map((m: { id: string }) => m.id)).toEqual(['m-002', 'm-003']);
    expect((await list(task.id, customer.cookie, '?after=m-003')).body.messages).toEqual([]);
  });

  it('US-23 sc.2 an empty or whitespace-only message is 400 MESSAGE_EMPTY and nothing is stored', async () => {
    const task = await activeTask();
    for (const body of [{ body: '' }, { body: '    ' }, {}]) {
      const res = await post(task.id, body, student.cookie);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('MESSAGE_EMPTY');
    }
    expect(await prisma.message.count()).toBe(0);
  });

  it('US-23 sc.2 a message over 2000 characters is 400 MESSAGE_TOO_LONG; exactly 2000 is accepted and the text is trimmed', async () => {
    const task = await activeTask();
    const tooLong = await post(task.id, { body: 'а'.repeat(2001) }, student.cookie);
    expect(tooLong.status).toBe(400);
    expect(tooLong.body.error.code).toBe('MESSAGE_TOO_LONG');
    expect((await post(task.id, { body: 'а'.repeat(2000) }, student.cookie)).status).toBe(201);
    const trimmed = await post(task.id, { body: '  привіт  ' }, student.cookie);
    expect(trimmed.body.message.body).toBe('привіт');
  });

  it('US-23 sc.2 a forged sender in the body is ignored: the sender is the session', async () => {
    const task = await activeTask();
    const res = await post(task.id, { body: 'Привіт', senderId: customer.user.id, taskId: 'other' }, student.cookie);
    expect(res.status).toBe(201);
    const row = await prisma.message.findFirstOrThrow({});
    expect(row.senderId).toBe(student.user.id);
    expect(row.taskId).toBe(task.id);
  });

  it('US-23 sc.3 a student who is not in the task gets 403 NOT_CHAT_PARTICIPANT on both endpoints and nothing is stored', async () => {
    const task = await activeTask();
    const outsider = await loginAs('student');

    const read = await list(task.id, outsider.cookie);
    expect(read.status).toBe(403);
    expect(read.body.error.code).toBe('NOT_CHAT_PARTICIPANT');
    const write = await post(task.id, { body: 'Привіт' }, outsider.cookie);
    expect(write.status).toBe(403);
    expect(write.body.error.code).toBe('NOT_CHAT_PARTICIPANT');
    expect(await prisma.message.count()).toBe(0);
  });

  it('US-23 sc.3 another customer is 403 too, and the access is checked before the body (a bad body from an outsider is 403, not 400)', async () => {
    const task = await activeTask();
    const otherCustomer = await loginAs('customer');
    expect((await list(task.id, otherCustomer.cookie)).body.error.code).toBe('NOT_CHAT_PARTICIPANT');
    const res = await post(task.id, { body: '' }, otherCustomer.cookie);
    expect(res.status).toBe(403);
  });

  it('US-23 an unknown task is 404 NOT_FOUND and no session is 401', async () => {
    const res = await list('no-such-task', student.cookie);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    const task = await activeTask();
    expect((await list(task.id)).status).toBe(401);
    expect((await post(task.id, { body: 'x' })).status).toBe(401);
  });

  it('US-23 INV-22 before assignment there is no chat: GET is an empty list and POST is 409 CHAT_CLOSED', async () => {
    const task = await createTask(customer.user.id, { status: 'published' });
    const read = await list(task.id, customer.cookie);
    expect(read.status).toBe(200);
    expect(read.body.messages).toEqual([]);
    const write = await post(task.id, { body: 'Привіт' }, customer.cookie);
    expect(write.status).toBe(409);
    expect(write.body.error.code).toBe('CHAT_CLOSED');
    expect(await prisma.message.count()).toBe(0);
  });

  it.each([['done'], ['cancelled']])('US-23 INV-22 after %s the chat is read-only: the history is listed, POST is 409 CHAT_CLOSED', async (status) => {
    const task = await activeTask({ status });
    await prisma.message.create({ data: { taskId: task.id, senderId: student.user.id, body: 'Остання' } });

    const read = await list(task.id, customer.cookie);
    expect(read.status).toBe(200);
    expect(read.body.messages).toHaveLength(1);
    const write = await post(task.id, { body: 'Ще одне' }, student.cookie);
    expect(write.status).toBe(409);
    expect(write.body.error.code).toBe('CHAT_CLOSED');
    expect(await prisma.message.count()).toBe(1);
  });

  // INV-22 race: the task becomes done after the chat state was read and before the insert (accept, US-31, will do this).
  // The client is patched by hand and put back in `finally`: `vi.spyOn` does not restore a Prisma client method.
  it('US-23 INV-22 a task that is accepted between the check and the insert is 409 CHAT_CLOSED and no message is stored', async () => {
    const task = await activeTask();
    const original = appPrisma.$transaction;
    appPrisma.$transaction = (async (...args: unknown[]) => {
      appPrisma.$transaction = original;
      await prisma.task.update({ where: { id: task.id }, data: { status: 'done' } });
      return (original as (...a: unknown[]) => unknown).apply(appPrisma, args);
    }) as never;
    let res;
    try {
      res = await post(task.id, { body: 'Вже пізно' }, student.cookie);
    } finally {
      appPrisma.$transaction = original;
    }

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CHAT_CLOSED');
    expect(await prisma.message.count()).toBe(0);
  });
});
