import { beforeEach, describe, expect, it } from 'vitest';
import { hashSessionId } from '../../src/modules/identity/domain';
import { setMySkills } from '../../src/modules/identity/service';
import { api } from '../helpers/app';
import { prisma, resetDb } from '../helpers/db';

const ORIGIN = 'http://localhost:5173';

let counter = 0;
async function loginAs(overrides: Record<string, unknown> = {}) {
  counter += 1;
  const user = await prisma.user.create({
    data: {
      email: `student${counter}@university.edu.ua`,
      passwordHash: 'x',
      displayName: `Студент ${counter}`,
      role: 'student',
      emailConfirmedAt: new Date(),
      ...overrides,
    },
  });
  const sid = `skills-session-${counter}`;
  await prisma.session.create({ data: { id: hashSessionId(sid), userId: user.id, expiresAt: new Date(Date.now() + 3600_000) } });
  return { user, cookie: `sid=${sid}` };
}

const putSkills = (cookie: string, skills: unknown) => api().put('/api/me/skills').set('Cookie', cookie).set('Origin', ORIGIN).send({ skills });
const profileSkills = async (userId: string) => (await api().get(`/api/profiles/${userId}`)).body.profile.skills as string[];
const manySkills = (n: number) => Array.from({ length: n }, (_, i) => `Навичка ${i + 1}`);

beforeEach(resetDb);

describe('PUT /api/me/skills: US-10 sc.1', () => {
  it('US-10 sc.1 the skills are saved and shown on the public profile, alphabetically', async () => {
    const { user, cookie } = await loginAs();

    const res = await putSkills(cookie, ['Java', 'HTML']);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ skills: ['HTML', 'Java'] });
    expect(await profileSkills(user.id)).toEqual(['HTML', 'Java']);
    expect(await prisma.profileSkill.count({ where: { userId: user.id } })).toBe(2);
  });

  it('US-10 sc.1 a new save replaces the whole set, and an empty list clears it', async () => {
    const { user, cookie } = await loginAs();
    await putSkills(cookie, ['Java', 'HTML']);

    const second = await putSkills(cookie, ['Python']);
    expect(second.body.skills).toEqual(['Python']);
    expect(await profileSkills(user.id)).toEqual(['Python']);

    const cleared = await putSkills(cookie, []);
    expect(cleared.status).toBe(200);
    expect(await profileSkills(user.id)).toEqual([]);
  });

  it('US-10 sc.1 a skill typed in another letter case reuses the existing skill row', async () => {
    const first = await loginAs();
    const second = await loginAs();
    await putSkills(first.cookie, ['Java']);

    const res = await putSkills(second.cookie, ['java']);

    expect(res.body.skills).toEqual(['Java']);
    expect(await prisma.skill.count()).toBe(1);
  });

  it('US-10 sc.1 a free-typed skill is stored outside the catalogue, a catalogue skill keeps its flag', async () => {
    await prisma.skill.create({ data: { name: 'Figma', inCatalog: true } });
    const { cookie } = await loginAs();

    await putSkills(cookie, ['Figma', 'Власна навичка']);

    const rows = await prisma.skill.findMany({ orderBy: { name: 'asc' } });
    expect(rows.map((r) => [r.name, r.inCatalog])).toEqual([
      ['Figma', true],
      ['Власна навичка', false],
    ]);
  });

  it('US-10 sc.1 without a session 401, for a customer or an unconfirmed email 403, and nothing is saved', async () => {
    const customer = await loginAs({ role: 'customer', email: 'owner@company.com' });
    const unconfirmed = await loginAs({ emailConfirmedAt: null });

    const anonymous = await api().put('/api/me/skills').send({ skills: ['Java'] });
    const a = await putSkills(customer.cookie, ['Java']);
    const b = await putSkills(unconfirmed.cookie, ['Java']);

    expect(anonymous.status).toBe(401);
    expect(anonymous.body.error.code).toBe('AUTH_REQUIRED');
    expect(a.status).toBe(403);
    expect(a.body.error.code).toBe('ROLE_FORBIDDEN');
    expect(b.status).toBe(403);
    expect(b.body.error.code).toBe('EMAIL_NOT_CONFIRMED');
    expect(await prisma.skill.count()).toBe(0);
    expect(await prisma.profileSkill.count()).toBe(0);
  });

  it('US-10 sc.1 two concurrent saves end with exactly one of the two sets and no duplicates', async () => {
    const { user, cookie } = await loginAs();

    const results = await Promise.all([putSkills(cookie, ['Java', 'HTML', 'CSS']), putSkills(cookie, ['Python', 'SQL'])]);

    expect(results.map((r) => r.status)).toEqual([200, 200]);
    const final = await profileSkills(user.id);
    expect([JSON.stringify(['CSS', 'HTML', 'Java']), JSON.stringify(['Python', 'SQL'])]).toContain(JSON.stringify(final));
    expect(await prisma.profileSkill.count({ where: { userId: user.id } })).toBe(final.length);
  });

  it('US-10 sc.1 rollback: when one skill cannot be stored, the previous set stays and no skill row is added', async () => {
    const { user, cookie } = await loginAs();
    await putSkills(cookie, ['Java']);
    const skillRowsBefore = await prisma.skill.count();

    // 41 characters violates the database CHECK (the shared schema normally stops it earlier).
    await expect(setMySkills(user, ['Новий', 'x'.repeat(41)])).rejects.toThrow();

    expect(await profileSkills(user.id)).toEqual(['Java']);
    expect(await prisma.skill.count()).toBe(skillRowsBefore);
  });
});

describe('PUT /api/me/skills: US-10 sc.2 empty skill', () => {
  it.each([[''], ['   ']])('US-10 sc.2 the skill %j is rejected with SKILL_EMPTY and the saved set is unchanged', async (empty) => {
    const { user, cookie } = await loginAs();
    await putSkills(cookie, ['Java']);

    const res = await putSkills(cookie, ['HTML', empty]);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('SKILL_EMPTY');
    expect(res.body.error.message).toBe('Навичка не може бути порожньою');
    expect(await profileSkills(user.id)).toEqual(['Java']);
  });

  it('US-10 sc.2 a duplicate ignoring case and a 41-character skill are VALIDATION_FAILED', async () => {
    const { cookie } = await loginAs();

    const duplicate = await putSkills(cookie, ['Java', 'java']);
    const tooLong = await putSkills(cookie, ['x'.repeat(41)]);

    expect(duplicate.status).toBe(400);
    expect(duplicate.body.error.code).toBe('VALIDATION_FAILED');
    expect(tooLong.status).toBe(400);
    expect(tooLong.body.error.code).toBe('VALIDATION_FAILED');
  });
});

describe('PUT /api/me/skills: US-10 sc.3 skill limit', () => {
  it('US-10 sc.3 20 skills are accepted', async () => {
    const { user, cookie } = await loginAs();

    const res = await putSkills(cookie, manySkills(20));

    expect(res.status).toBe(200);
    expect(await profileSkills(user.id)).toHaveLength(20);
  });

  it('US-10 sc.3 the 21st skill gives SKILLS_LIMIT and nothing is saved', async () => {
    const { user, cookie } = await loginAs();
    await putSkills(cookie, ['Java']);

    const res = await putSkills(cookie, manySkills(21));

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('SKILLS_LIMIT');
    expect(res.body.error.message).toBe('Досягнуто ліміту навичок (20)');
    expect(await profileSkills(user.id)).toEqual(['Java']);
  });
});

describe('GET /api/skills (catalogue suggestions)', () => {
  beforeEach(async () => {
    await prisma.skill.createMany({
      data: [
        { name: 'Java', inCatalog: true },
        { name: 'JavaScript', inCatalog: true },
        { name: 'Копірайтинг', inCatalog: true },
        { name: 'Випадкова навичка', inCatalog: false },
      ],
    });
  });

  it('US-10 sc.1 returns the catalogue only, sorted, and filters by the query ignoring case', async () => {
    const { cookie } = await loginAs();

    const all = await api().get('/api/skills').set('Cookie', cookie);
    const filtered = await api().get('/api/skills?query=JAVA').set('Cookie', cookie);
    const cyrillic = await api().get('/api/skills').query({ query: 'КОП' }).set('Cookie', cookie);

    expect(all.status).toBe(200);
    expect(all.body.skills).toEqual(['Копірайтинг', 'Java', 'JavaScript']); // Ukrainian collation: Cyrillic before Latin
    expect(filtered.body.skills).toEqual(['Java', 'JavaScript']);
    expect(cyrillic.body.skills).toEqual(['Копірайтинг']);
  });

  it('US-10 sc.1 needs a session', async () => {
    const res = await api().get('/api/skills');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_REQUIRED');
  });
});
