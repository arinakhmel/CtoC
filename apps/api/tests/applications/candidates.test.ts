import { beforeEach, describe, expect, it } from 'vitest';
import { hashSessionId } from '../../src/modules/identity/domain';
import { api } from '../helpers/app';
import { prisma, resetDb } from '../helpers/db';
import { createApplication, createTask } from '../helpers/factories';

let counter = 0;
async function loginAs(role: 'student' | 'customer', overrides: Record<string, unknown> = {}) {
  counter += 1;
  const user = await prisma.user.create({
    data: {
      email: `cand${counter}@${role === 'student' ? 'university.edu.ua' : 'company.com'}`,
      passwordHash: 'x',
      displayName: `Користувач ${counter}`,
      role,
      emailConfirmedAt: new Date(),
      studentVerifiedAt: role === 'student' ? new Date() : null,
      ...overrides,
    },
  });
  const sid = `cand-session-${counter}`;
  await prisma.session.create({ data: { id: hashSessionId(sid), userId: user.id, expiresAt: new Date(Date.now() + 3600_000) } });
  return { user, cookie: `sid=${sid}` };
}

const list = (taskId: string, cookie?: string) => {
  const req = api().get(`/api/tasks/${taskId}/applications`);
  return cookie ? req.set('Cookie', cookie) : req;
};
async function withProfile(userId: string, skills: string[], bio: string) {
  await prisma.studentProfile.create({ data: { userId, bio } });
  for (const name of skills) {
    const skill = await prisma.skill.upsert({ where: { name }, create: { name }, update: {} });
    await prisma.profileSkill.create({ data: { userId, skillId: skill.id } });
  }
}

let owner: Awaited<ReturnType<typeof loginAs>>;
beforeEach(async () => {
  await resetDb();
  owner = await loginAs('customer');
});

describe('Candidate list of a task: US-24', () => {
  it('US-24 sc.1 the owner gets the applicants with name, verified flag, skills, bio, status and note, oldest first', async () => {
    const task = await createTask(owner.user.id, { title: 'Логотип для кав’ярні', priceKopecks: 50_000 });
    const olena = await loginAs('student', { displayName: 'Олена Коваль' });
    const petro = await loginAs('student', { displayName: 'Петро Іваненко' });
    await withProfile(olena.user.id, ['Java', 'HTML'], 'Студентка 2 курсу');
    await createApplication(task.id, petro.user.id, { createdAt: new Date('2026-11-01T10:00:00Z'), note: 'Маю досвід' });
    await createApplication(task.id, olena.user.id, { createdAt: new Date('2026-11-02T10:00:00Z') });

    const res = await list(task.id, owner.cookie);

    expect(res.status).toBe(200);
    expect(res.body.task).toEqual({ id: task.id, title: 'Логотип для кав’ярні', status: 'published', priceKopecks: 50_000 });
    expect(res.body.applications).toHaveLength(2);
    expect(res.body.applications.map((a: { student: { displayName: string } }) => a.student.displayName)).toEqual(['Петро Іваненко', 'Олена Коваль']);
    expect(res.body.applications[0]).toMatchObject({ status: 'sent', note: 'Маю досвід', student: { id: petro.user.id, verified: true, skills: [], bio: '' } });
    expect(res.body.applications[1].student).toEqual({
      id: olena.user.id,
      displayName: 'Олена Коваль',
      verified: true,
      skills: ['HTML', 'Java'],
      bio: 'Студентка 2 курсу',
    });
  });

  it('US-24 the list is cut at 100 applicants and `truncated` says so; with 100 or fewer it is false', async () => {
    const task = await createTask(owner.user.id);
    const students = await prisma.$transaction(
      Array.from({ length: 101 }, (_, i) =>
        prisma.user.create({
          data: { email: `many${i}@university.edu.ua`, passwordHash: 'x', displayName: `Студент ${i}`, role: 'student', emailConfirmedAt: new Date(), studentVerifiedAt: new Date() },
        }),
      ),
    );
    await prisma.application.createMany({
      data: students.slice(0, 100).map((s, i) => ({ taskId: task.id, studentId: s.id, status: 'sent', createdAt: new Date(Date.UTC(2026, 10, 1, 0, 0, i)) })),
    });

    const exact = await list(task.id, owner.cookie);
    expect(exact.body.applications).toHaveLength(100);
    expect(exact.body.truncated).toBe(false);

    await createApplication(task.id, students[100]!.id, { createdAt: new Date(Date.UTC(2026, 10, 2)) });
    const cut = await list(task.id, owner.cookie);
    expect(cut.body.applications).toHaveLength(100);
    expect(cut.body.truncated).toBe(true);
  });

  it('US-24 the answer is not cached: personal data has Cache-Control no-store on every API route, not only the balance', async () => {
    const task = await createTask(owner.user.id);
    expect((await list(task.id, owner.cookie)).headers['cache-control']).toBe('no-store');
    expect((await api().get('/api/me/notifications').set('Cookie', owner.cookie)).headers['cache-control']).toBe('no-store');
    expect((await api().get('/api/health')).status).toBe(200);
  });

  it('US-24 sc.1 an applicant shows only the public profile: no email, role or hash, and no price', async () => {
    const task = await createTask(owner.user.id);
    const student = await loginAs('student');
    await createApplication(task.id, student.user.id);

    const res = await list(task.id, owner.cookie);

    expect(Object.keys(res.body.applications[0]).sort()).toEqual(['createdAt', 'id', 'note', 'status', 'student', 'taskId']);
    expect(Object.keys(res.body.applications[0].student).sort()).toEqual(['bio', 'displayName', 'id', 'skills', 'verified']);
    expect(JSON.stringify(res.body)).not.toContain(student.user.email);
  });

  // W-01: an unverified student cannot apply (US-18 sc.3), so the scenario is the verification being revoked after applying.
  it('US-24 sc.2 an applicant whose verification is gone has no verified flag, here and on the public profile', async () => {
    const task = await createTask(owner.user.id);
    const student = await loginAs('student');
    await createApplication(task.id, student.user.id);
    expect((await list(task.id, owner.cookie)).body.applications[0].student.verified).toBe(true);

    await prisma.user.update({ where: { id: student.user.id }, data: { studentVerifiedAt: null } });

    expect((await list(task.id, owner.cookie)).body.applications[0].student.verified).toBe(false);
    const profile = await api().get(`/api/profiles/${student.user.id}`);
    expect(profile.status).toBe(200);
    expect(profile.body.profile.verified).toBe(false);
  });

  it('US-24 a task with no applicants gives an empty list, and another task\'s applicants are not mixed in', async () => {
    const empty = await createTask(owner.user.id);
    const other = await createTask(owner.user.id);
    const student = await loginAs('student');
    await createApplication(other.id, student.user.id);

    const res = await list(empty.id, owner.cookie);

    expect(res.status).toBe(200);
    expect(res.body.applications).toEqual([]);
  });

  it("US-24 another customer's task is 403 NOT_TASK_OWNER and shows nothing", async () => {
    const task = await createTask(owner.user.id);
    const student = await loginAs('student');
    await createApplication(task.id, student.user.id);
    const other = await loginAs('customer');

    const res = await list(task.id, other.cookie);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NOT_TASK_OWNER');
    expect(JSON.stringify(res.body)).not.toContain(student.user.id);
  });

  it('US-24 a student is 403 ROLE_FORBIDDEN, an unconfirmed customer 403 EMAIL_NOT_CONFIRMED, no session 401, an unknown task 404', async () => {
    const task = await createTask(owner.user.id);
    const student = await loginAs('student');
    expect((await list(task.id, student.cookie)).body.error.code).toBe('ROLE_FORBIDDEN');
    const unconfirmed = await loginAs('customer', { emailConfirmedAt: null });
    expect((await list(task.id, unconfirmed.cookie)).body.error.code).toBe('EMAIL_NOT_CONFIRMED');
    expect((await list(task.id)).status).toBe(401);
    const unknown = await list('no-such-task', owner.cookie);
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.code).toBe('NOT_FOUND');
  });
});
