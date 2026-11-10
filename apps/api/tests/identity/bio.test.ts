import { beforeEach, describe, expect, it } from 'vitest';
import { hashSessionId } from '../../src/modules/identity/domain';
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
  const sid = `bio-session-${counter}`;
  await prisma.session.create({ data: { id: hashSessionId(sid), userId: user.id, expiresAt: new Date(Date.now() + 3600_000) } });
  return { user, cookie: `sid=${sid}` };
}

const putBio = (cookie: string, body: unknown) => api().put('/api/me/profile').set('Cookie', cookie).set('Origin', ORIGIN).send(body as object);
const publicBio = async (userId: string) => (await api().get(`/api/profiles/${userId}`)).body.profile.bio as string;

beforeEach(resetDb);

describe('PUT /api/me/profile: US-11 sc.1', () => {
  it('US-11 sc.1 a bio within the limit is saved and shown on the public profile', async () => {
    const { user, cookie } = await loginAs();

    const res = await putBio(cookie, { bio: 'Студент 2 курсу, люблю frontend.' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ bio: 'Студент 2 курсу, люблю frontend.' });
    expect(await publicBio(user.id)).toBe('Студент 2 курсу, люблю frontend.');
  });

  it('US-11 sc.1 a profile without a saved bio shows an empty text, a new save replaces it and an empty one clears it', async () => {
    const { user, cookie } = await loginAs();
    expect(await publicBio(user.id)).toBe('');

    await putBio(cookie, { bio: 'Перший текст' });
    await putBio(cookie, { bio: 'Другий текст' });
    expect(await publicBio(user.id)).toBe('Другий текст');
    expect(await prisma.studentProfile.count({ where: { userId: user.id } })).toBe(1);

    const cleared = await putBio(cookie, { bio: '' });
    expect(cleared.status).toBe(200);
    expect(await publicBio(user.id)).toBe('');
  });

  it('US-11 sc.1 exactly 500 characters are accepted', async () => {
    const { user, cookie } = await loginAs();

    const res = await putBio(cookie, { bio: 'а'.repeat(500) });

    expect(res.status).toBe(200);
    expect((await publicBio(user.id)).length).toBe(500);
  });

  it('US-11 sc.1 a student can change only their own bio, whatever the body says', async () => {
    const me = await loginAs();
    const other = await loginAs();

    await putBio(me.cookie, { bio: 'Мій текст', userId: other.user.id });

    expect(await publicBio(me.user.id)).toBe('Мій текст');
    expect(await publicBio(other.user.id)).toBe('');
  });

  it('US-11 sc.1 without a session 401, for a customer or an unconfirmed email 403, and nothing is saved', async () => {
    const customer = await loginAs({ role: 'customer', email: 'owner@company.com' });
    const unconfirmed = await loginAs({ emailConfirmedAt: null });

    const anonymous = await api().put('/api/me/profile').send({ bio: 'x' });
    const a = await putBio(customer.cookie, { bio: 'x' });
    const b = await putBio(unconfirmed.cookie, { bio: 'x' });

    expect(anonymous.status).toBe(401);
    expect(anonymous.body.error.code).toBe('AUTH_REQUIRED');
    expect(a.status).toBe(403);
    expect(a.body.error.code).toBe('ROLE_FORBIDDEN');
    expect(b.status).toBe(403);
    expect(b.body.error.code).toBe('EMAIL_NOT_CONFIRMED');
    expect(await prisma.studentProfile.count()).toBe(0);
  });

  it('US-11 sc.1 two concurrent first saves both succeed and leave one row with one of the two texts', async () => {
    const { user, cookie } = await loginAs();

    const results = await Promise.all([putBio(cookie, { bio: 'Текст A' }), putBio(cookie, { bio: 'Текст B' })]);

    expect(results.map((r) => r.status)).toEqual([200, 200]);
    expect(await prisma.studentProfile.count({ where: { userId: user.id } })).toBe(1);
    expect(['Текст A', 'Текст B']).toContain(await publicBio(user.id));
  });
});

describe('PUT /api/me/profile: US-11 sc.2 too long', () => {
  it('US-11 sc.2 501 characters give BIO_TOO_LONG and the saved bio is unchanged', async () => {
    const { user, cookie } = await loginAs();
    await putBio(cookie, { bio: 'Збережений текст' });

    const res = await putBio(cookie, { bio: 'а'.repeat(501) });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BIO_TOO_LONG');
    expect(res.body.error.message).toBe('Текст «Про мене» перевищує 500 символів');
    expect(await publicBio(user.id)).toBe('Збережений текст');
  });

  it('US-11 sc.2 a missing or non-string bio is VALIDATION_FAILED', async () => {
    const { cookie } = await loginAs();

    for (const body of [{}, { bio: 5 }, { bio: null }]) {
      const res = await putBio(cookie, body);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    }
  });
});

describe('PUT /api/me/profile: US-11 sc.3 UTF-8', () => {
  const tricky = 'Люблю код 💻, дизайн 🎨 і каву ☕!\nРядок 2: «лапки», „лапки“, "quotes", it\'s — тире… 👨‍👩‍👧 🇺🇦\n\tз табуляцією';

  it('US-11 sc.3 emoji, ZWJ sequences, quotes, line breaks and punctuation round-trip byte for byte, also in the database', async () => {
    const { user, cookie } = await loginAs();

    const res = await putBio(cookie, { bio: tricky });

    expect(res.status).toBe(200);
    expect(res.body.bio).toBe(tricky);
    expect(await publicBio(user.id)).toBe(tricky);

    const stored = await prisma.studentProfile.findUniqueOrThrow({ where: { userId: user.id } });
    expect(stored.bio).toBe(tricky);
    const [{ hex }] = await prisma.$queryRaw<Array<{ hex: string }>>`SELECT hex(bio) AS hex FROM student_profiles WHERE user_id = ${user.id}`;
    expect(hex).toBe(Buffer.from(tricky, 'utf8').toString('hex').toUpperCase()); // stored as UTF-8, no re-encoding
  });

  it('US-11 sc.3 characters are counted like the database does: 500 emoji are accepted, 501 are rejected', async () => {
    const { user, cookie } = await loginAs();

    const ok = await putBio(cookie, { bio: '💻'.repeat(500) }); // 1000 UTF-16 units, 500 characters
    const tooLong = await putBio(cookie, { bio: '💻'.repeat(501) });

    expect(ok.status).toBe(200);
    expect(tooLong.status).toBe(400);
    expect(tooLong.body.error.code).toBe('BIO_TOO_LONG');
    const [{ chars }] = await prisma.$queryRaw<Array<{ chars: bigint }>>`SELECT length(bio) AS chars FROM student_profiles WHERE user_id = ${user.id}`;
    expect(Number(chars)).toBe(500);
  });
});
