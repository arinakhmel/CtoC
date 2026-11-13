import { beforeEach, describe, expect, it } from 'vitest';
import { hashSessionId } from '../../src/modules/identity/domain';
import { api } from '../helpers/app';
import { prisma, resetDb } from '../helpers/db';
import { createTask, createUser } from '../helpers/factories';

let counter = 0;
/** A student with a confirmed email. `verified: true` (the default) is a student approved by a moderator. */
async function loginAs(overrides: Record<string, unknown> = {}, verified = true) {
  counter += 1;
  const user = await prisma.user.create({
    data: {
      email: `apply${counter}@university.edu.ua`,
      passwordHash: 'x',
      displayName: 'Олена Коваль',
      role: 'student',
      emailConfirmedAt: new Date(),
      studentVerifiedAt: verified ? new Date() : null,
      ...overrides,
    },
  });
  const sid = `apply-session-${counter}`;
  await prisma.session.create({ data: { id: hashSessionId(sid), userId: user.id, expiresAt: new Date(Date.now() + 3600_000) } });
  return { user, cookie: `sid=${sid}` };
}

let customerId: string;
const publish = (overrides: Record<string, unknown> = {}) => createTask(customerId, { publishedAt: new Date(), ...overrides });
const ORIGIN = 'http://localhost:5173';
const apply = (taskId: string, body: unknown = {}, cookie?: string) => {
  const req = api().post(`/api/tasks/${taskId}/applications`);
  return (cookie ? req.set('Cookie', cookie).set('Origin', ORIGIN) : req).send(body as object);
};

beforeEach(async () => {
  await resetDb();
  customerId = (await createUser({ role: 'customer', email: 'owner@company.com' })).id;
});

describe('POST /api/tasks/:id/applications: US-18', () => {
  it('US-18 sc.1 a verified student applies to a published task: 201, status sent, one row', async () => {
    const { cookie, user } = await loginAs();
    const task = await publish();

    const res = await apply(task.id, {}, cookie);

    expect(res.status).toBe(201);
    expect(res.body.application).toMatchObject({ taskId: task.id, status: 'sent', note: null });
    expect(typeof res.body.application.id).toBe('string');
    expect(Object.keys(res.body.application).sort()).toEqual(['createdAt', 'id', 'note', 'status', 'taskId']);
    const rows = await prisma.application.findMany({ where: { taskId: task.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ studentId: user.id, status: 'sent' });
  });

  it('US-18 sc.2 a second application to the same task is 409 ALREADY_APPLIED and creates no second row', async () => {
    const { cookie } = await loginAs();
    const task = await publish();
    expect((await apply(task.id, {}, cookie)).status).toBe(201);

    const res = await apply(task.id, {}, cookie);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ALREADY_APPLIED');
    expect(await prisma.application.count({ where: { taskId: task.id } })).toBe(1);
  });

  it('US-18 sc.2 INV-09 two parallel applications of one student: one 201, one 409, one row', async () => {
    const { cookie } = await loginAs();
    const task = await publish();

    const results = await Promise.all([apply(task.id, {}, cookie), apply(task.id, {}, cookie)]);

    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(results.find((r) => r.status === 409)!.body.error.code).toBe('ALREADY_APPLIED');
    expect(await prisma.application.count({ where: { taskId: task.id } })).toBe(1);
  });

  it('US-18 sc.2 two different students can both apply to the same task', async () => {
    const first = await loginAs();
    const second = await loginAs();
    const task = await publish();
    expect((await apply(task.id, {}, first.cookie)).status).toBe(201);
    expect((await apply(task.id, {}, second.cookie)).status).toBe(201);
    expect(await prisma.application.count({ where: { taskId: task.id } })).toBe(2);
  });

  // W-02, decided: the student sees the button and presses it; the API blocks the action and the UI offers verification.
  it('US-18 sc.3 a confirmed but unverified student gets 403 STUDENT_NOT_VERIFIED and no application is created', async () => {
    const { cookie } = await loginAs({}, false);
    const task = await publish();

    const res = await apply(task.id, {}, cookie);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('STUDENT_NOT_VERIFIED');
    expect(await prisma.application.count()).toBe(0);
  });

  it('US-18 sc.3 INV-02 a student whose verification was revoked can no longer apply', async () => {
    const { cookie, user } = await loginAs();
    const task = await publish();
    await prisma.user.update({ where: { id: user.id }, data: { studentVerifiedAt: null } });
    const res = await apply(task.id, {}, cookie);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('STUDENT_NOT_VERIFIED');
  });

  it('US-18 a student with an unconfirmed email is 403 EMAIL_NOT_CONFIRMED', async () => {
    const { cookie } = await loginAs({ emailConfirmedAt: null });
    const task = await publish();
    const res = await apply(task.id, {}, cookie);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('EMAIL_NOT_CONFIRMED');
  });

  it('US-18 a customer is 403 ROLE_FORBIDDEN', async () => {
    const { cookie } = await loginAs({ role: 'customer' }, false); // only students can be verified (DB CHECK)
    const task = await publish();
    const res = await apply(task.id, {}, cookie);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ROLE_FORBIDDEN');
  });

  it('US-18 no session is 401 AUTH_REQUIRED', async () => {
    const task = await publish();
    const res = await apply(task.id);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_REQUIRED');
  });

  it.each([
    ['pending moderation', { status: 'pending_moderation', publishedAt: null }],
    ['rejected', { status: 'rejected', publishedAt: null }],
    ['past deadline', { deadlineAt: new Date(Date.now() - 3600_000) }],
  ])('US-18 sc.1 a %s task is 404 NOT_FOUND and gets no application', async (_name, overrides) => {
    const { cookie } = await loginAs();
    const task = await publish(overrides);
    const res = await apply(task.id, {}, cookie);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(await prisma.application.count()).toBe(0);
  });

  it('US-18 a task that already has an executor is 404 NOT_FOUND, an unknown id too', async () => {
    const { cookie, user } = await loginAs();
    const other = await loginAs();
    const taken = await publish({ executorId: other.user.id, status: 'in_progress' });
    expect((await apply(taken.id, {}, cookie)).status).toBe(404);
    const res = await apply('no-such-task', {}, cookie);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(await prisma.application.count({ where: { studentId: user.id } })).toBe(0);
  });

  it('US-18 with a note (US-19): 201 and the note is stored; a note over the limit is 400 NOTE_TOO_LONG', async () => {
    const { cookie } = await loginAs();
    const task = await publish();

    const tooLong = await apply(task.id, { note: 'а'.repeat(501) }, cookie);
    expect(tooLong.status).toBe(400);
    expect(tooLong.body.error.code).toBe('NOTE_TOO_LONG');
    expect(await prisma.application.count()).toBe(0);

    const ok = await apply(task.id, { note: 'Маю досвід у подібних лабораторних роботах' }, cookie);
    expect(ok.status).toBe(201);
    expect(ok.body.application.note).toBe('Маю досвід у подібних лабораторних роботах');
  });

  it('US-18 an unverified student gets 403 before the body is validated', async () => {
    const { cookie } = await loginAs({}, false);
    const task = await publish();
    const res = await apply(task.id, { note: 'а'.repeat(501) }, cookie);
    expect(res.status).toBe(403);
  });
});

describe('POST /api/tasks/:id/applications: US-13 sc.2 / US-42', () => {
  // W-05, decided: a forged price is stripped, the request succeeds and the task keeps the customer's price.
  it('US-13 sc.2 a forged priceKopecks is stripped: 201, no price in the answer, the task price is unchanged', async () => {
    const { cookie } = await loginAs();
    const task = await publish({ priceKopecks: 50_000 });

    const res = await apply(task.id, { note: 'Маю досвід', priceKopecks: 100, status: 'accepted', studentId: 'someone-else' }, cookie);

    expect(res.status).toBe(201);
    expect(res.body.application).not.toHaveProperty('priceKopecks');
    expect(res.body.application.status).toBe('sent');
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).priceKopecks).toBe(50_000);
    const [row] = await prisma.application.findMany();
    expect(row?.status).toBe('sent');
    expect(row?.studentId).not.toBe('someone-else');
  });
});
