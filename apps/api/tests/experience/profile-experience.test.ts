import { randomUUID } from 'node:crypto';
import { LIMITS } from '@ctoc/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { hashSessionId } from '../../src/modules/identity/domain';
import { api } from '../helpers/app';
import { prisma, resetDb } from '../helpers/db';
import { createTask } from '../helpers/factories';

/**
 * US-37 (the experience record in the profile: title, «обсяг» read as the description (W-15), date) and US-38 (confirmed by the
 * platform, never added or edited by the student): `GET /api/profiles/:userId`, api.md §4.9. Records are created only by the
 * real accept (US-31), so the happy paths go through it.
 */

const ORIGIN = 'http://localhost:5173';

let counter = 0;
async function loginAs(role: 'student' | 'customer', overrides: Record<string, unknown> = {}) {
  counter += 1;
  const user = await prisma.user.create({
    data: {
      email: `exp${counter}@${role === 'student' ? 'university.edu.ua' : 'company.com'}`,
      passwordHash: 'x',
      displayName: `Користувач ${counter}`,
      role,
      emailConfirmedAt: new Date(),
      studentVerifiedAt: role === 'student' ? new Date() : null,
      ...overrides,
    },
  });
  const sid = `exp-session-${counter}`;
  await prisma.session.create({ data: { id: hashSessionId(sid), userId: user.id, expiresAt: new Date(Date.now() + 3600_000) } });
  return { user, cookie: `sid=${sid}` };
}

type Login = Awaited<ReturnType<typeof loginAs>>;

const profile = (userId: string) => api().get(`/api/profiles/${userId}`);
const experienceOf = async (userId: string) => (await profile(userId)).body.profile.experience as Array<Record<string, unknown>>;

let customer: Login;
let student: Login;

/** A task under review as the flow leaves it (price held, split snapshotted, a submitted version), then the real accept. */
async function acceptedTask(executor: Login, title: string, description: string) {
  const task = await createTask(customer.user.id, {
    title,
    description,
    status: 'in_review',
    executorId: executor.user.id,
    publishedAt: new Date(),
    assignedAt: new Date(),
    priceKopecks: 100_000,
    commissionBp: 1000,
    commissionKopecks: 10_000,
    netKopecks: 90_000,
  });
  await prisma.escrow.create({ data: { taskId: task.id, customerId: customer.user.id, amountKopecks: 100_000, status: 'held', idempotencyKey: randomUUID() } });
  await prisma.balance.upsert({ where: { ownerId: customer.user.id }, create: { ownerId: customer.user.id, availableKopecks: 0 }, update: {} });
  await prisma.ledgerEntry.createMany({
    data: [
      { ownerId: customer.user.id, kind: 'topup', amountKopecks: 100_000 },
      { ownerId: customer.user.id, kind: 'hold', amountKopecks: -100_000, taskId: task.id },
    ],
  });
  await prisma.resultVersion.create({ data: { taskId: task.id, version: 1, status: 'submitted', submittedAt: new Date() } });
  const res = await api().post(`/api/tasks/${task.id}/accept`).set('Cookie', customer.cookie).set('Origin', ORIGIN);
  expect(res.status).toBe(200);
  return prisma.task.findUniqueOrThrow({ where: { id: task.id } });
}

/** A done task with its record at a given completion time, without the accept (for ordering and caps). */
async function doneRecord(executor: Login, title: string, completedAt: Date) {
  const task = await createTask(customer.user.id, { title, status: 'done', executorId: executor.user.id, publishedAt: new Date(), assignedAt: new Date(), completedAt });
  return prisma.experienceRecord.create({ data: { studentId: executor.user.id, taskId: task.id, title, description: `Опис: ${title}`, completedAt } });
}

beforeEach(async () => {
  await resetDb();
  customer = await loginAs('customer');
  student = await loginAs('student');
});

describe('The experience record in the profile: US-37', () => {
  it('US-37 sc.1 after the customer accepts, the profile «Досвід / Резюме» has a record with the title, the description and the exact completion date', async () => {
    const task = await acceptedTask(student, 'Логотип для кав’ярні', 'Векторний логотип у трьох кольорах');

    const res = await profile(student.user.id);

    expect(res.status).toBe(200);
    expect(res.body.profile.experience).toEqual([
      {
        id: expect.any(String),
        title: 'Логотип для кав’ярні',
        description: 'Векторний логотип у трьох кольорах',
        completedAt: task.completedAt!.toISOString(),
        confirmedBy: 'platform',
      },
    ]);
  });

  it('US-37 sc.1 a student with no finished task has an empty list, not a missing field', async () => {
    expect(await experienceOf(student.user.id)).toEqual([]);
  });

  // W-07, decided: no story lets a customer cancel after the selection, so the task is made cancelled by the factory.
  it('US-37 sc.2 a cancelled task cannot be accepted (409) and leaves no record in the profile', async () => {
    const task = await createTask(customer.user.id, { status: 'cancelled', executorId: student.user.id, publishedAt: new Date(), assignedAt: new Date() });

    const accept = await api().post(`/api/tasks/${task.id}/accept`).set('Cookie', customer.cookie).set('Origin', ORIGIN);

    expect(accept.status).toBe(409);
    expect(accept.body.error.code).toBe('TASK_NOT_IN_REVIEW');
    expect(await prisma.experienceRecord.count()).toBe(0);
    expect(await experienceOf(student.user.id)).toEqual([]);
  });

  it('US-37 sc.2 INV-21 even a record of a task that is not done is never shown (defence in depth)', async () => {
    const task = await createTask(customer.user.id, { status: 'cancelled', executorId: student.user.id, publishedAt: new Date(), assignedAt: new Date() });
    await prisma.experienceRecord.create({ data: { studentId: student.user.id, taskId: task.id, title: task.title, description: 'x', completedAt: new Date() } });

    expect(await experienceOf(student.user.id)).toEqual([]);
  });

  it('US-37 sc.3 several finished tasks of different dates are listed newest first', async () => {
    await doneRecord(student, 'Березневе завдання', new Date('2026-03-10T10:00:00Z'));
    await doneRecord(student, 'Листопадове завдання', new Date('2026-11-10T10:00:00Z'));
    await doneRecord(student, 'Травневе завдання', new Date('2026-05-10T10:00:00Z'));

    const titles = (await experienceOf(student.user.id)).map((record) => record.title);

    expect(titles).toEqual(['Листопадове завдання', 'Травневе завдання', 'Березневе завдання']);
  });

  it('US-37 sc.3 two records accepted one after the other through the real accept: the later one is first', async () => {
    await acceptedTask(student, 'Перше завдання', 'Опис першого');
    await acceptedTask(student, 'Друге завдання', 'Опис другого');

    expect((await experienceOf(student.user.id)).map((record) => record.title)).toEqual(['Друге завдання', 'Перше завдання']);
  });

  it('US-37 only the student’s own records are in their profile', async () => {
    const other = await loginAs('student');
    await acceptedTask(other, 'Чуже завдання', 'Опис');
    await acceptedTask(student, 'Моє завдання', 'Опис');

    expect((await experienceOf(student.user.id)).map((record) => record.title)).toEqual(['Моє завдання']);
    expect((await experienceOf(other.user.id)).map((record) => record.title)).toEqual(['Чуже завдання']);
  });

  it('US-37 the profile publishes no amount of the task and no email (A-16)', async () => {
    await acceptedTask(student, 'Логотип для кав’ярні', 'Опис');
    const text = JSON.stringify((await profile(student.user.id)).body);
    expect(text).not.toMatch(/Kopecks|price|@/);
  });

  it('US-37 the list is capped at LIMITS.experienceMax', async () => {
    for (let i = 0; i < LIMITS.experienceMax + 2; i += 1) await doneRecord(student, `Завдання номер ${i}`, new Date(Date.UTC(2026, 0, 1, 0, i)));
    expect(await experienceOf(student.user.id)).toHaveLength(LIMITS.experienceMax);
  });
});

describe('Confirmed by the platform, never by the student: US-38', () => {
  it('US-38 sc.1 every record carries the platform confirmation, for any viewer, with or without a session', async () => {
    await acceptedTask(student, 'Перше завдання', 'Опис');
    await acceptedTask(student, 'Друге завдання', 'Опис');

    const anonymous = await profile(student.user.id);
    const asCustomer = await api().get(`/api/profiles/${student.user.id}`).set('Cookie', customer.cookie);

    for (const res of [anonymous, asCustomer]) {
      expect(res.status).toBe(200);
      expect(res.body.profile.experience).toHaveLength(2);
      expect(res.body.profile.experience.every((record: { confirmedBy: string }) => record.confirmedBy === 'platform')).toBe(true);
    }
  });

  it.each(['post', 'put', 'patch', 'delete'] as const)('US-38 sc.2 %s /api/me/experience does not exist: 404 NOT_FOUND and nothing changes', async (method) => {
    await acceptedTask(student, 'Справжнє завдання', 'Опис');
    const before = await prisma.experienceRecord.findMany({ orderBy: { id: 'asc' } });

    const res = await api()[method]('/api/me/experience').set('Cookie', student.cookie).set('Origin', ORIGIN).send({
      title: 'Вигаданий досвід',
      description: 'Додано вручну',
      completedAt: '2026-01-01T00:00:00Z',
    });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(await prisma.experienceRecord.findMany({ orderBy: { id: 'asc' } })).toEqual(before);
  });

  it('US-38 sc.2 no route edits or deletes one record either: 404 NOT_FOUND', async () => {
    await acceptedTask(student, 'Справжнє завдання', 'Опис');
    const record = await prisma.experienceRecord.findFirstOrThrow({});

    for (const method of ['put', 'patch', 'delete'] as const) {
      for (const path of [`/api/me/experience/${record.id}`, `/api/experience/${record.id}`, `/api/profiles/${student.user.id}`]) {
        const res = await api()[method](path).set('Cookie', student.cookie).set('Origin', ORIGIN).send({ title: 'Змінено' });
        expect(res.status, `${method} ${path}`).toBe(404);
      }
    }
    expect((await prisma.experienceRecord.findUniqueOrThrow({ where: { id: record.id } })).title).toBe('Справжнє завдання');
  });

  it('US-38 sc.3 after the student changes the skills and the bio, the records and their confirmation are exactly the same', async () => {
    await acceptedTask(student, 'Перше завдання', 'Опис першого');
    await acceptedTask(student, 'Друге завдання', 'Опис другого');
    const before = await experienceOf(student.user.id);
    const rowsBefore = await prisma.experienceRecord.findMany({ orderBy: { id: 'asc' } });

    const skills = await api().put('/api/me/skills').set('Cookie', student.cookie).set('Origin', ORIGIN).send({ skills: ['Java', 'HTML'] });
    const bio = await api().put('/api/me/profile').set('Cookie', student.cookie).set('Origin', ORIGIN).send({ bio: 'Студентка 3 курсу, люблю дизайн' });
    expect(skills.status).toBe(200);
    expect(bio.status).toBe(200);

    const after = await profile(student.user.id);
    expect(after.body.profile.skills).toEqual(['HTML', 'Java']);
    expect(after.body.profile.bio).toBe('Студентка 3 курсу, люблю дизайн');
    expect(after.body.profile.experience).toEqual(before);
    expect(await prisma.experienceRecord.findMany({ orderBy: { id: 'asc' } })).toEqual(rowsBefore);
  });

  it('US-38 INV-21 the database refuses a second record for the same task', async () => {
    const task = await acceptedTask(student, 'Одне завдання', 'Опис');
    await expect(
      prisma.experienceRecord.create({ data: { studentId: student.user.id, taskId: task.id, title: 'Дубль', description: 'x', completedAt: new Date() } }),
    ).rejects.toThrow();
  });
});
