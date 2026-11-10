import { beforeEach, describe, expect, it } from 'vitest';
import { generateToken, hashToken } from '../../src/modules/identity/domain';
import { resendConfirmation } from '../../src/modules/identity/service';
import { clearOutbox, consoleMailer, getOutbox, setMailer } from '../../src/platform/ports/mailer';
import { api } from '../helpers/app';
import { prisma, resetDb } from '../helpers/db';

const EMAIL = 'user@university.edu.ua';

beforeEach(async () => {
  await resetDb();
  clearOutbox();
  setMailer(consoleMailer);
  await prisma.universityDomain.create({ data: { domain: 'university.edu.ua' } });
});

/** Registers through the API and returns the token from the emailed link, like a user would. */
async function registerStudent(email = EMAIL): Promise<string> {
  const res = await api()
    .post('/api/auth/register')
    .send({ role: 'student', email, displayName: 'Олена Коваль', password: 'secret-pass' });
  expect(res.status).toBe(201);
  const mail = getOutbox().filter((m) => m.to === email).at(-1)!;
  return new URL(mail.link!).searchParams.get('token')!;
}

const userByEmail = (email = EMAIL) => prisma.user.findUniqueOrThrow({ where: { email } });

describe('POST /api/auth/confirm-email', () => {
  it('US-07 sc.1 a valid token confirms the email and the token is spent', async () => {
    const token = await registerStudent();

    const res = await api().post('/api/auth/confirm-email').send({ token });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      user: { id: expect.any(String), role: 'student', displayName: 'Олена Коваль', emailConfirmed: true },
    });
    const user = await userByEmail();
    expect(user.emailConfirmedAt).not.toBeNull();
    const stored = await prisma.emailToken.findUniqueOrThrow({ where: { tokenHash: hashToken(token) } });
    expect(stored.usedAt).not.toBeNull();
  });

  it('US-07 sc.1 the same link twice: the second time is TOKEN_INVALID', async () => {
    const token = await registerStudent();
    await api().post('/api/auth/confirm-email').send({ token });

    const res = await api().post('/api/auth/confirm-email').send({ token });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('TOKEN_INVALID');
    expect(res.body.error.message).toBe('Посилання недійсне');
  });

  it('US-07 sc.1 an unknown or missing token is TOKEN_INVALID and confirms nobody', async () => {
    await registerStudent();

    const unknown = await api().post('/api/auth/confirm-email').send({ token: generateToken() });
    const missing = await api().post('/api/auth/confirm-email').send({});

    expect(unknown.status).toBe(400);
    expect(unknown.body.error.code).toBe('TOKEN_INVALID');
    expect(missing.status).toBe(400);
    expect(missing.body.error.code).toBe('TOKEN_INVALID');
    expect((await userByEmail()).emailConfirmedAt).toBeNull();
  });

  it('US-07 sc.1 two concurrent requests with one token: one 200, one TOKEN_INVALID', async () => {
    const token = await registerStudent();
    const app = api();

    const results = await Promise.all([
      app.post('/api/auth/confirm-email').send({ token }),
      app.post('/api/auth/confirm-email').send({ token }),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
    expect(results.find((r) => r.status === 400)!.body.error.code).toBe('TOKEN_INVALID');
    expect((await userByEmail()).emailConfirmedAt).not.toBeNull();
  });

  it('US-07 sc.2 a token older than 24 h is TOKEN_EXPIRED, the account stays unconfirmed', async () => {
    const token = await registerStudent();
    await prisma.emailToken.updateMany({
      where: { tokenHash: hashToken(token) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const res = await api().post('/api/auth/confirm-email').send({ token });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('TOKEN_EXPIRED');
    expect(res.body.error.message).toBe('Термін дії посилання минув. Надіслати лист повторно?');
    expect((await userByEmail()).emailConfirmedAt).toBeNull();
    const stored = await prisma.emailToken.findUniqueOrThrow({ where: { tokenHash: hashToken(token) } });
    expect(stored.usedAt).toBeNull();
  });

  it('US-07 sc.2 the stored token lifetime is 24 hours', async () => {
    const token = await registerStudent();
    const stored = await prisma.emailToken.findUniqueOrThrow({ where: { tokenHash: hashToken(token) } });
    const ttl = stored.expiresAt.getTime() - stored.createdAt.getTime();
    expect(ttl).toBeGreaterThan(23.9 * 3600 * 1000);
    expect(ttl).toBeLessThanOrEqual(24 * 3600 * 1000 + 5000);
  });
});

describe('POST /api/auth/resend-confirmation', () => {
  it('US-07 sc.3 a resend sends a new email and invalidates the older token', async () => {
    const oldToken = await registerStudent();
    clearOutbox();

    const res = await api().post('/api/auth/resend-confirmation').send({ email: 'USER@university.edu.ua' });

    expect(res.status).toBe(202);
    expect(getOutbox()).toHaveLength(1);
    const newToken = new URL(getOutbox()[0]!.link!).searchParams.get('token')!;
    expect(newToken).not.toBe(oldToken);
    expect(await prisma.emailToken.count({ where: { purpose: 'confirm_email' } })).toBe(2);
    expect(await prisma.emailToken.count({ where: { usedAt: null } })).toBe(1);

    const stale = await api().post('/api/auth/confirm-email').send({ token: oldToken });
    expect(stale.status).toBe(400);
    expect(stale.body.error.code).toBe('TOKEN_INVALID');

    const fresh = await api().post('/api/auth/confirm-email').send({ token: newToken });
    expect(fresh.status).toBe(200);
    expect((await userByEmail()).emailConfirmedAt).not.toBeNull();
  });

  it('US-07 sc.3 after an expired link a resend gives a working link', async () => {
    const token = await registerStudent();
    await prisma.emailToken.updateMany({ where: { tokenHash: hashToken(token) }, data: { expiresAt: new Date(Date.now() - 1000) } });
    clearOutbox();

    await api().post('/api/auth/resend-confirmation').send({ email: EMAIL });
    const fresh = new URL(getOutbox()[0]!.link!).searchParams.get('token')!;

    expect((await api().post('/api/auth/confirm-email').send({ token: fresh })).status).toBe(200);
  });

  it('US-07 sc.3 an already confirmed account gets EMAIL_ALREADY_CONFIRMED and no email', async () => {
    const token = await registerStudent();
    await api().post('/api/auth/confirm-email').send({ token });
    clearOutbox();

    const res = await api().post('/api/auth/resend-confirmation').send({ email: EMAIL });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_ALREADY_CONFIRMED');
    expect(getOutbox()).toHaveLength(0);
  });

  it('US-07 sc.3 an unknown email gets the same 202 and nothing is sent or stored', async () => {
    const res = await api().post('/api/auth/resend-confirmation').send({ email: 'nobody@university.edu.ua' });

    expect(res.status).toBe(202);
    expect(getOutbox()).toHaveLength(0);
    expect(await prisma.emailToken.count()).toBe(0);
  });

  it('US-07 sc.3 a malformed email is VALIDATION_FAILED', async () => {
    const res = await api().post('/api/auth/resend-confirmation').send({ email: 'nope' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('US-07 sc.3 rollback: if the new token cannot be stored, the older token stays valid', async () => {
    const oldToken = await registerStudent();
    clearOutbox();
    const clash = await prisma.user.create({
      data: { email: 'other@university.edu.ua', passwordHash: 'x', displayName: 'Other', role: 'student' },
    });
    await prisma.emailToken.create({
      data: { userId: clash.id, purpose: 'confirm_email', tokenHash: hashToken('fixed'), expiresAt: new Date(Date.now() + 1000) },
    });

    await expect(resendConfirmation(EMAIL, { generateToken: () => 'fixed' })).rejects.toThrow();

    expect(getOutbox()).toHaveLength(0);
    const res = await api().post('/api/auth/confirm-email').send({ token: oldToken });
    expect(res.status).toBe(200);
  });

  it('US-07 sc.3 the resend endpoint is rate limited', async () => {
    const app = api();
    let last = 0;
    for (let i = 0; i < 6; i += 1) {
      last = (await app.post('/api/auth/resend-confirmation').send({ email: 'nobody@university.edu.ua' })).status;
    }
    expect(last).toBe(429);
  });
});
