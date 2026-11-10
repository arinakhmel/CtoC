import bcrypt from 'bcryptjs';
import { beforeEach, describe, expect, it } from 'vitest';
import { hashSessionId } from '../../src/modules/identity/domain';
import { ensureModerator } from '../../src/seed/moderator';
import { api } from '../helpers/app';
import { prisma, resetDb } from '../helpers/db';

const PASSWORD = 'secret-pass';
const ORIGIN = 'http://localhost:5173';
const passwordHash = bcrypt.hashSync(PASSWORD, 4);

const makeUser = (overrides: Record<string, unknown> = {}) =>
  prisma.user.create({
    data: {
      email: 'user@university.edu.ua',
      passwordHash,
      displayName: 'Олена Коваль',
      role: 'student',
      emailConfirmedAt: new Date(),
      ...overrides,
    },
  });

const cookieValue = (res: { headers: Record<string, unknown> }): string => {
  const raw = (res.headers['set-cookie'] as string[]).find((c) => c.startsWith('sid='))!;
  return raw.split(';')[0]!.slice('sid='.length);
};

beforeEach(resetDb);

describe('POST /api/auth/login', () => {
  it('US-45 sc.1 correct credentials create a session and set a hardened sid cookie', async () => {
    const user = await makeUser();

    const res = await api().post('/api/auth/login').send({ email: ' User@University.EDU.UA ', password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      user: { id: user.id, role: 'student', displayName: 'Олена Коваль', emailConfirmed: true, studentVerified: false },
    });
    expect(JSON.stringify(res.body)).not.toContain('university.edu.ua');
    expect(JSON.stringify(res.body)).not.toContain(user.passwordHash);

    const setCookie = (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('sid='))!;
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).toContain('Path=/');
    expect(setCookie).toContain(`Max-Age=${7 * 24 * 3600}`);

    const sessions = await prisma.session.findMany();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.userId).toBe(user.id);
    expect(sessions[0]!.id).toBe(hashSessionId(cookieValue(res)));
    expect(sessions[0]!.id).not.toBe(cookieValue(res));
    const lifetime = sessions[0]!.expiresAt.getTime() - Date.now();
    expect(lifetime).toBeGreaterThan(6.99 * 24 * 3600 * 1000);
    expect(lifetime).toBeLessThanOrEqual(7 * 24 * 3600 * 1000);
  });

  it('US-45 sc.1 the cookie opens GET /api/me for each role', async () => {
    await makeUser();
    await makeUser({ email: 'owner@company.com', role: 'customer', displayName: 'ФОП Іваненко' });
    await makeUser({ email: 'mod@ctoc.local', role: 'moderator', displayName: 'Модератор' });

    for (const [email, role] of [
      ['user@university.edu.ua', 'student'],
      ['owner@company.com', 'customer'],
      ['mod@ctoc.local', 'moderator'],
    ] as const) {
      const app = api();
      const loginRes = await app.post('/api/auth/login').send({ email, password: PASSWORD });
      const me = await app.get('/api/me').set('Cookie', `sid=${cookieValue(loginRes)}`);
      expect(me.status).toBe(200);
      expect(me.body.user.role).toBe(role);
    }
  });

  it('US-45 sc.1 a user with an unconfirmed email can log in and sees emailConfirmed false', async () => {
    await makeUser({ emailConfirmedAt: null });

    const res = await api().post('/api/auth/login').send({ email: 'user@university.edu.ua', password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.user.emailConfirmed).toBe(false);
  });

  it('US-45 sc.2 a wrong password and an unknown email give the identical 401', async () => {
    await makeUser();
    const app = api();

    const wrongPassword = await app.post('/api/auth/login').send({ email: 'user@university.edu.ua', password: 'wrong-pass' });
    const unknownEmail = await app.post('/api/auth/login').send({ email: 'nobody@university.edu.ua', password: PASSWORD });

    for (const res of [wrongPassword, unknownEmail]) {
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
      expect(res.body.error.message).toBe('Невірна пошта або пароль');
      expect(res.headers['set-cookie']).toBeUndefined();
    }
    expect(wrongPassword.body).toEqual(unknownEmail.body);
    expect(await prisma.session.count()).toBe(0);
  });

  it('US-45 validation: a malformed email or an empty password is VALIDATION_FAILED', async () => {
    const res = await api().post('/api/auth/login').send({ email: 'nope', password: '' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('US-45 sc.3 after 5 failed attempts the next one is RATE_LIMITED, even with the right password', async () => {
    await makeUser();
    const app = api();
    for (let i = 0; i < 5; i += 1) {
      const res = await app.post('/api/auth/login').send({ email: 'user@university.edu.ua', password: 'wrong-pass' });
      expect(res.status).toBe(401);
    }

    const blocked = await app.post('/api/auth/login').send({ email: 'user@university.edu.ua', password: PASSWORD });

    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
    expect(blocked.body.error.message).toBe('Забагато спроб. Спробуйте пізніше');
    expect(await prisma.session.count()).toBe(0);
  });

  it('US-45 sc.3 a successful login resets the failure count', async () => {
    await makeUser();
    const app = api();
    for (let i = 0; i < 4; i += 1) {
      await app.post('/api/auth/login').send({ email: 'user@university.edu.ua', password: 'wrong-pass' });
    }
    expect((await app.post('/api/auth/login').send({ email: 'user@university.edu.ua', password: PASSWORD })).status).toBe(200);

    for (let i = 0; i < 4; i += 1) {
      expect((await app.post('/api/auth/login').send({ email: 'user@university.edu.ua', password: 'wrong-pass' })).status).toBe(401);
    }
  });

  it('US-45 sc.3 successful logins are not counted as failures', async () => {
    await makeUser();
    const app = api();
    for (let i = 0; i < 7; i += 1) {
      expect((await app.post('/api/auth/login').send({ email: 'user@university.edu.ua', password: PASSWORD })).status).toBe(200);
    }
  });
});

describe('GET /api/me and the session', () => {
  it('US-45 without a cookie, with an unknown cookie and with an expired session the answer is 401 AUTH_REQUIRED', async () => {
    const user = await makeUser();
    const app = api();
    const loginRes = await app.post('/api/auth/login').send({ email: 'user@university.edu.ua', password: PASSWORD });
    const sid = cookieValue(loginRes);

    const none = await app.get('/api/me');
    const unknown = await app.get('/api/me').set('Cookie', 'sid=not-a-session');
    await prisma.session.updateMany({ where: { userId: user.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const expired = await app.get('/api/me').set('Cookie', `sid=${sid}`);

    for (const res of [none, unknown, expired]) {
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_REQUIRED');
      expect(res.body.error.message).toBe('Увійдіть, щоб продовжити');
    }
  });

  it('US-45 a login removes expired sessions of all users', async () => {
    const user = await makeUser();
    await prisma.session.create({ data: { id: 'stale', userId: user.id, expiresAt: new Date(Date.now() - 1000) } });

    await api().post('/api/auth/login').send({ email: 'user@university.edu.ua', password: PASSWORD });

    expect(await prisma.session.count({ where: { id: 'stale' } })).toBe(0);
    expect(await prisma.session.count()).toBe(1);
  });
});

describe('CSRF Origin check (ADR-0006)', () => {
  it('US-45 a state-changing request with the session cookie and a foreign or missing Origin is ORIGIN_MISMATCH', async () => {
    await makeUser();
    const app = api();
    const sid = cookieValue(await app.post('/api/auth/login').send({ email: 'user@university.edu.ua', password: PASSWORD }));

    const foreign = await app.post('/api/auth/resend-confirmation').set('Cookie', `sid=${sid}`).set('Origin', 'https://evil.example').send({ email: 'user@university.edu.ua' });
    const missing = await app.post('/api/auth/resend-confirmation').set('Cookie', `sid=${sid}`).send({ email: 'user@university.edu.ua' });

    for (const res of [foreign, missing]) {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('ORIGIN_MISMATCH');
    }
  });

  it('US-45 the app origin passes, and requests without the session cookie are not checked', async () => {
    await makeUser({ emailConfirmedAt: null });
    const app = api();
    const sid = cookieValue(await app.post('/api/auth/login').send({ email: 'user@university.edu.ua', password: PASSWORD }));

    const allowed = await app.post('/api/auth/resend-confirmation').set('Cookie', `sid=${sid}`).set('Origin', ORIGIN).send({ email: 'user@university.edu.ua' });
    const publicCall = await app.post('/api/auth/resend-confirmation').send({ email: 'user@university.edu.ua' });
    const safeGet = await app.get('/api/me').set('Cookie', `sid=${sid}`);

    expect(allowed.status).toBe(202);
    expect(publicCall.status).toBe(202);
    expect(safeGet.status).toBe(200);
  });
});

describe('moderator seed (ADR-0006)', () => {
  it('US-45 a seeded moderator is confirmed and can log in; running the seed again changes nothing', async () => {
    expect(await ensureModerator(prisma, { email: 'Moderator@CtoC.local', password: 'moderator-pass' })).toBe(true);
    expect(await ensureModerator(prisma, { email: 'moderator@ctoc.local', password: 'another-pass' })).toBe(false);

    const moderator = await prisma.user.findUniqueOrThrow({ where: { email: 'moderator@ctoc.local' } });
    expect(moderator.role).toBe('moderator');
    expect(moderator.emailConfirmedAt).not.toBeNull();
    expect(await prisma.user.count()).toBe(1);

    const ok = await api().post('/api/auth/login').send({ email: 'moderator@ctoc.local', password: 'moderator-pass' });
    const changed = await api().post('/api/auth/login').send({ email: 'moderator@ctoc.local', password: 'another-pass' });
    expect(ok.status).toBe(200);
    expect(ok.body.user.role).toBe('moderator');
    expect(changed.status).toBe(401);
  });
});
