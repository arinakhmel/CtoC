import { beforeEach, describe, expect, it } from 'vitest';
import { hashSessionId } from '../../src/modules/identity/domain';
import { clearOutbox, consoleMailer, getOutbox, setMailer } from '../../src/platform/ports/mailer';
import { api } from '../helpers/app';
import { prisma, resetDb } from '../helpers/db';
import { createLoggedInUser, createTask } from '../helpers/factories';

const ORIGIN = 'http://localhost:5173';
const student = (displayName: string, email = 'olena@university.edu.ua') => ({ role: 'student', email, displayName, password: 'secret-pass' });

beforeEach(async () => {
  await resetDb();
  clearOutbox();
  setMailer(consoleMailer);
  await prisma.universityDomain.create({ data: { domain: 'university.edu.ua' } });
});

/** The account made by the real registration, then confirmed and verified directly in the database (US-07, US-10 are not under test). */
async function registeredStudent(displayName: string) {
  const res = await api().post('/api/auth/register').send(student(displayName));
  expect(res.status).toBe(201);
  const user = await prisma.user.update({
    where: { id: res.body.user.id },
    data: { emailConfirmedAt: new Date(), studentVerifiedAt: new Date() },
  });
  const sid = 'display-name-student';
  await prisma.session.create({ data: { id: hashSessionId(sid), userId: user.id, expiresAt: new Date(Date.now() + 3600_000) } });
  return { user, cookie: `sid=${sid}` };
}

describe('display name (US-44)', () => {
  it('US-44 sc.1 the name given at sign-up is stored and the customer sees it in the list of applicants', async () => {
    const { user, cookie } = await registeredStudent('Олена Коваль');
    expect(user.displayName).toBe('Олена Коваль');

    const owner = await createLoggedInUser('customer');
    const task = await createTask(owner.user.id, { publishedAt: new Date() });
    const applied = await api().post(`/api/tasks/${task.id}/applications`).set('Cookie', cookie).set('Origin', ORIGIN).send({});
    expect(applied.status).toBe(201);

    const list = await api().get(`/api/tasks/${task.id}/applications`).set('Cookie', owner.cookie);
    expect(list.status).toBe(200);
    expect(list.body.applications).toHaveLength(1);
    expect(list.body.applications[0].student.displayName).toBe('Олена Коваль');
  });

  it('US-44 sc.2 a name of one character is VALIDATION_FAILED on displayName, no account and no email', async () => {
    const res = await api().post('/api/auth/register').send(student('О'));

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.details).toEqual([{ field: 'displayName', code: 'VALIDATION_FAILED' }]);
    expect(await prisma.user.count()).toBe(0);
    expect(getOutbox()).toHaveLength(0);
  });

  it('US-44 sc.3 the public profile shows the name and no email anywhere', async () => {
    const { user } = await registeredStudent('Олена Коваль');

    const res = await api().get(`/api/profiles/${user.id}`);

    expect(res.status).toBe(200);
    expect(res.body.profile?.displayName ?? res.body.displayName).toBe('Олена Коваль');
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('olena@university.edu.ua');
    expect(body).not.toContain('@');
    expect(Object.keys(res.body.profile ?? res.body)).not.toContain('email');
  });

  it('US-44 checklist: Cyrillic, Latin and emoji names round-trip through the API and the database, counted in characters', async () => {
    const names = ['Олена Коваль', 'Anna Smith', 'Max 🙂 Dev', '🙂'.repeat(60)];
    for (const [i, name] of names.entries()) {
      const res = await api().post('/api/auth/register').send(student(name, `n${i}@university.edu.ua`));
      expect(res.status).toBe(201);
      expect(res.body.user.displayName).toBe(name);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: res.body.user.id } })).displayName).toBe(name);
    }
    const tooLong = await api().post('/api/auth/register').send(student('🙂'.repeat(61), 'long@university.edu.ua'));
    expect(tooLong.status).toBe(400);
    expect(tooLong.body.error.details).toEqual([{ field: 'displayName', code: 'VALIDATION_FAILED' }]);
  });
});
