import bcrypt from 'bcryptjs';
import { beforeEach, describe, expect, it } from 'vitest';
import { api } from '../helpers/app';
import { prisma, resetDb } from '../helpers/db';
import { createFile } from '../helpers/factories';

let counter = 0;
const makeUser = (overrides: Record<string, unknown> = {}) => {
  counter += 1;
  return prisma.user.create({
    data: {
      email: `student${counter}@university.edu.ua`,
      passwordHash: bcrypt.hashSync('secret-pass', 4),
      displayName: `Олена Коваль ${counter}`,
      role: 'student',
      emailConfirmedAt: new Date(),
      ...overrides,
    },
  });
};

beforeEach(resetDb);

describe('GET /api/profiles/:userId (US-09)', () => {
  it('US-09 sc.1 a verified student has verified: true, and the body exposes no private data', async () => {
    const student = await makeUser({ studentVerifiedAt: new Date(), displayName: 'Олена Коваль' });

    const res = await api().get(`/api/profiles/${student.id}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ profile: { id: student.id, displayName: 'Олена Коваль', verified: true, skills: [], bio: '' } });
    expect(JSON.stringify(res.body)).not.toContain('university.edu.ua');
    expect(JSON.stringify(res.body)).not.toContain(student.passwordHash);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('US-09 sc.1 the profile is public: it needs no session', async () => {
    const student = await makeUser({ studentVerifiedAt: new Date() });
    const res = await api().get(`/api/profiles/${student.id}`);
    expect(res.status).toBe(200);
  });

  it('US-09 sc.2 a student who never uploaded a document has no badge', async () => {
    const student = await makeUser();

    const res = await api().get(`/api/profiles/${student.id}`);

    expect(res.status).toBe(200);
    expect(res.body.profile.verified).toBe(false);
  });

  it('US-09 sc.2 a student with an unconfirmed email has a profile without a badge', async () => {
    const student = await makeUser({ emailConfirmedAt: null });

    const res = await api().get(`/api/profiles/${student.id}`);

    expect(res.status).toBe(200);
    expect(res.body.profile.verified).toBe(false);
  });

  it('US-09 sc.2 a pending or a rejected request does not give the badge', async () => {
    const pending = await makeUser();
    const rejected = await makeUser();
    await prisma.verificationRequest.create({ data: { userId: pending.id, fileId: (await createFile(pending.id)).id, status: 'pending' } });
    const moderator = await makeUser({ role: 'moderator', email: 'mod@ctoc.local' });
    await prisma.verificationRequest.create({
      data: {
        userId: rejected.id,
        fileId: (await createFile(rejected.id)).id,
        status: 'rejected',
        reason: 'Документ нечитабельний',
        decidedBy: moderator.id,
        decidedAt: new Date(),
      },
    });

    const a = await api().get(`/api/profiles/${pending.id}`);
    const b = await api().get(`/api/profiles/${rejected.id}`);

    expect(a.body.profile.verified).toBe(false);
    expect(b.body.profile.verified).toBe(false);
  });

  it('US-09 sc.2 an unknown id, a customer and a moderator all give the same 404 NOT_FOUND', async () => {
    const customer = await makeUser({ role: 'customer', email: 'owner@company.com' });
    const moderator = await makeUser({ role: 'moderator', email: 'mod@ctoc.local' });

    const responses = await Promise.all(
      ['00000000-0000-4000-8000-000000000000', 'not-an-id', customer.id, moderator.id].map((id) => api().get(`/api/profiles/${id}`)),
    );

    for (const res of responses) {
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    }
    expect(new Set(responses.map((r) => JSON.stringify(r.body))).size).toBe(1);
  });

  it('US-09 sc.3 the flag comes from the database: it is the same for a new app, a new login and after a revoke', async () => {
    const student = await makeUser({ studentVerifiedAt: new Date() });

    const first = await api().get(`/api/profiles/${student.id}`);
    const secondApp = await api().get(`/api/profiles/${student.id}`);
    const loginRes = await api().post('/api/auth/login').send({ email: student.email, password: 'secret-pass' });
    const sid = (loginRes.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('sid='))!.split(';')[0]!;
    const afterLogin = await api().get(`/api/profiles/${student.id}`).set('Cookie', sid);

    expect([first, secondApp, afterLogin].map((r) => r.body.profile.verified)).toEqual([true, true, true]);

    await prisma.user.update({ where: { id: student.id }, data: { studentVerifiedAt: null } }); // A-18 revoke
    const afterRevoke = await api().get(`/api/profiles/${student.id}`);
    expect(afterRevoke.body.profile.verified).toBe(false);
  });
});
