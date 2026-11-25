import bcrypt from 'bcryptjs';
import { beforeEach, describe, expect, it } from 'vitest';
import { hashSessionId } from '../../src/modules/identity/domain';
import { api } from '../helpers/app';
import { prisma, resetDb } from '../helpers/db';

const PASSWORD = 'secret-pass';
const ORIGIN = 'http://localhost:5173';
const passwordHash = bcrypt.hashSync(PASSWORD, 4);

const makeUser = (email = 'user@university.edu.ua') =>
  prisma.user.create({
    data: { email, passwordHash, displayName: 'Олена Коваль', role: 'student', emailConfirmedAt: new Date() },
  });

async function loginAs(email = 'user@university.edu.ua'): Promise<string> {
  const res = await api().post('/api/auth/login').send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  const raw = (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('sid='))!;
  return raw.split(';')[0]!.slice('sid='.length);
}

const logout = (sid: string, origin: string | null = ORIGIN) => {
  const req = api().post('/api/auth/logout').set('Cookie', `sid=${sid}`);
  return (origin ? req.set('Origin', origin) : req).send();
};

beforeEach(resetDb);

describe('POST /api/auth/logout (US-46)', () => {
  it('US-46 sc.1 logout answers 204, deletes the session row and clears the sid cookie', async () => {
    const user = await makeUser();
    const sid = await loginAs();
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(1);

    const res = await logout(sid);

    expect(res.status).toBe(204);
    expect(res.text).toBe('');
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
    const setCookie = (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('sid='))!;
    expect(setCookie).toMatch(/^sid=;/);
    expect(setCookie).toMatch(/Expires=/i);
    expect(setCookie).toContain('HttpOnly');
  });

  it('US-46 sc.2 the old cookie is 401 AUTH_REQUIRED and returns no data, on /api/me and on a second logout', async () => {
    await makeUser();
    const sid = await loginAs();
    expect((await api().get('/api/me').set('Cookie', `sid=${sid}`)).status).toBe(200);
    await logout(sid);

    const me = await api().get('/api/me').set('Cookie', `sid=${sid}`);
    const again = await logout(sid);

    for (const res of [me, again]) {
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: { code: 'AUTH_REQUIRED', message: 'Увійдіть, щоб продовжити' } });
    }
  });

  it('US-46 sc.2 without a cookie logout is 401 AUTH_REQUIRED', async () => {
    const res = await api().post('/api/auth/logout').send();
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_REQUIRED');
  });

  it('US-46 sc.3 an expired session is 401 AUTH_REQUIRED on logout too, and nothing is deleted for other users', async () => {
    const user = await makeUser();
    const other = await makeUser('other@university.edu.ua');
    const sid = await loginAs();
    await loginAs('other@university.edu.ua');
    await prisma.session.updateMany({ where: { userId: user.id }, data: { expiresAt: new Date(Date.now() - 1000) } });

    const res = await logout(sid);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_REQUIRED');
    expect(await prisma.session.count({ where: { userId: other.id } })).toBe(1);
  });

  it('US-46 only this session ends: the other sessions of the same user stay valid', async () => {
    const user = await makeUser();
    const first = await loginAs();
    const second = await loginAs();

    expect((await logout(first)).status).toBe(204);

    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(1);
    expect((await api().get('/api/me').set('Cookie', `sid=${second}`)).status).toBe(200);
    expect((await api().get('/api/me').set('Cookie', `sid=${first}`)).status).toBe(401);
  });

  it('US-46 a foreign or missing Origin is 403 ORIGIN_MISMATCH and the session stays', async () => {
    await makeUser();
    const sid = await loginAs();

    for (const origin of ['https://evil.example', null]) {
      const res = await logout(sid, origin);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('ORIGIN_MISMATCH');
    }
    expect(await prisma.session.count({ where: { id: hashSessionId(sid) } })).toBe(1);
  });

  it('US-46 race: two parallel logouts with one cookie give one 204 and one 401, never a 500', async () => {
    await makeUser();
    const sid = await loginAs();

    const results = await Promise.all([logout(sid), logout(sid)]);

    expect(results.map((r) => r.status).sort()).toEqual([204, 401]);
    expect(results.find((r) => r.status === 401)!.body.error.code).toBe('AUTH_REQUIRED');
    expect(await prisma.session.count()).toBe(0);
  });
});
