import bcrypt from 'bcryptjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { api } from '../helpers/app';
import { prisma, resetDb } from '../helpers/db';

const ORIGIN = 'http://localhost:5173';
const CODE = 'team-test-code';
const passwordHash = bcrypt.hashSync('not-used-here', 4);

const makeDemoAccounts = async () => {
  const base = { passwordHash, emailConfirmedAt: new Date() };
  await prisma.user.create({ data: { ...base, email: 'seed.student@ctoc.local', displayName: 'Тест Студент', role: 'student' } });
  await prisma.user.create({ data: { ...base, email: 'seed.customer@ctoc.local', displayName: 'Тест Замовник', role: 'customer' } });
  await prisma.user.create({ data: { ...base, email: 'moderator@ctoc.local', displayName: 'Модератор', role: 'moderator' } });
};

const saved = { code: process.env.TEAM_LOGIN_CODE, moderator: process.env.SEED_MODERATOR_EMAIL };

beforeEach(async () => {
  await resetDb();
  process.env.TEAM_LOGIN_CODE = CODE;
  delete process.env.SEED_MODERATOR_EMAIL;
});
afterEach(() => {
  if (saved.code === undefined) delete process.env.TEAM_LOGIN_CODE;
  else process.env.TEAM_LOGIN_CODE = saved.code;
  if (saved.moderator !== undefined) process.env.SEED_MODERATOR_EMAIL = saved.moderator;
});

describe('ADR-0010 team quick login', () => {
  it('GET /api/auth/team-login says whether it is on, and never returns the code', async () => {
    const on = await api().get('/api/auth/team-login');
    expect(on.status).toBe(200);
    expect(on.body).toEqual({ enabled: true });

    delete process.env.TEAM_LOGIN_CODE;
    const off = await api().get('/api/auth/team-login');
    expect(off.body).toEqual({ enabled: false });
  });

  it('the right code opens each of the three demo accounts with a session cookie', async () => {
    await makeDemoAccounts();
    for (const [account, role] of [
      ['student', 'student'],
      ['customer', 'customer'],
      ['moderator', 'moderator'],
    ] as const) {
      const res = await api().post('/api/auth/team-login').set('Origin', ORIGIN).send({ code: CODE, account });
      expect(res.status).toBe(200);
      expect(res.body.user.role).toBe(role);
      expect((res.headers['set-cookie'] as unknown as string[]).some((c) => c.startsWith('sid=') && /HttpOnly/i.test(c))).toBe(true);
    }
  });

  it('a wrong code is 401 INVALID_CREDENTIALS and opens nothing', async () => {
    await makeDemoAccounts();
    const res = await api().post('/api/auth/team-login').set('Origin', ORIGIN).send({ code: 'guess', account: 'moderator' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(await prisma.session.count()).toBe(0);
  });

  it('the code check answers 204 for the right code and 401 for a wrong one', async () => {
    expect((await api().post('/api/auth/team-login/check').set('Origin', ORIGIN).send({ code: CODE })).status).toBe(204);
    expect((await api().post('/api/auth/team-login/check').set('Origin', ORIGIN).send({ code: 'nope' })).status).toBe(401);
  });

  it('without TEAM_LOGIN_CODE the feature is off: 404, even with a code', async () => {
    delete process.env.TEAM_LOGIN_CODE;
    await makeDemoAccounts();
    const res = await api().post('/api/auth/team-login').set('Origin', ORIGIN).send({ code: CODE, account: 'student' });
    expect(res.status).toBe(404);
  });

  it('a demo account that does not exist in this database is 404', async () => {
    const res = await api().post('/api/auth/team-login').set('Origin', ORIGIN).send({ code: CODE, account: 'customer' });
    expect(res.status).toBe(404);
  });

  it('an unknown account name is 400 VALIDATION_FAILED', async () => {
    const res = await api().post('/api/auth/team-login').set('Origin', ORIGIN).send({ code: CODE, account: 'admin' });
    expect(res.status).toBe(400);
  });

  it('5 wrong codes from one address are then 429 RATE_LIMITED, even with the right code', async () => {
    const app = api(); // one app: the limiter lives in it
    for (let i = 0; i < 5; i += 1) await app.post('/api/auth/team-login/check').set('Origin', ORIGIN).send({ code: `wrong-${i}` });
    const res = await app.post('/api/auth/team-login/check').set('Origin', ORIGIN).send({ code: CODE });
    expect(res.status).toBe(429);
  });
});
