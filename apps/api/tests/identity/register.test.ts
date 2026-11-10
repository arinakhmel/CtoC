import bcrypt from 'bcryptjs';
import { beforeEach, describe, expect, it } from 'vitest';
import { hashToken } from '../../src/modules/identity/domain';
import { register } from '../../src/modules/identity/service';
import { clearOutbox, getOutbox, setMailer, consoleMailer } from '../../src/platform/ports/mailer';
import { api } from '../helpers/app';
import { prisma, resetDb } from '../helpers/db';
import { createUser } from '../helpers/factories';

const student = (overrides: Record<string, unknown> = {}) => ({
  role: 'student',
  email: 'user@university.edu.ua',
  displayName: 'Олена Коваль',
  password: 'secret-pass',
  ...overrides,
});

beforeEach(async () => {
  await resetDb();
  clearOutbox();
  setMailer(consoleMailer);
  await prisma.universityDomain.create({ data: { domain: 'university.edu.ua' } });
});

describe('POST /api/auth/register (student)', () => {
  it('US-06 sc.1 a university email creates an unconfirmed account and sends the confirmation email', async () => {
    const res = await api().post('/api/auth/register').send(student({ email: 'User@University.edu.ua' }));

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      user: { id: expect.any(String), role: 'student', displayName: 'Олена Коваль', emailConfirmed: false },
    });
    expect(JSON.stringify(res.body)).not.toContain('secret-pass');

    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'user@university.edu.ua' } });
    expect(user.emailConfirmedAt).toBeNull();
    expect(user.role).toBe('student');
    expect(user.passwordHash).not.toBe('secret-pass');
    expect(await bcrypt.compare('secret-pass', user.passwordHash)).toBe(true);

    const outbox = await api().get('/api/dev/outbox');
    expect(outbox.status).toBe(200);
    expect(outbox.body.emails).toHaveLength(1);
    const mail = outbox.body.emails[0];
    expect(mail.to).toBe('user@university.edu.ua');
    const token = new URL(mail.link).searchParams.get('token')!;

    const stored = await prisma.emailToken.findMany({ where: { userId: user.id } });
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ purpose: 'confirm_email', tokenHash: hashToken(token), usedAt: null });
    expect(stored[0]!.tokenHash).not.toBe(token);
    const ttl = stored[0]!.expiresAt.getTime() - Date.now();
    expect(ttl).toBeGreaterThan(23.9 * 3600 * 1000);
    expect(ttl).toBeLessThanOrEqual(24 * 3600 * 1000);
  });

  it('US-06 sc.1 forged role, status or confirmation fields are ignored', async () => {
    const res = await api()
      .post('/api/auth/register')
      .send(student({ emailConfirmedAt: new Date().toISOString(), studentVerifiedAt: new Date().toISOString() }));
    expect(res.status).toBe(201);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'user@university.edu.ua' } });
    expect(user.emailConfirmedAt).toBeNull();
    expect(user.studentVerifiedAt).toBeNull();

    const mod = await api().post('/api/auth/register').send(student({ role: 'moderator', email: 'm@university.edu.ua' }));
    expect(mod.status).toBe(400);
    expect(mod.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('US-06 sc.1 the account is created even when the email provider fails', async () => {
    setMailer({ send: async () => Promise.reject(new Error('smtp down')) });
    const res = await api().post('/api/auth/register').send(student());
    expect(res.status).toBe(201);
    expect(await prisma.user.count()).toBe(1);
  });

  it('US-06 sc.2 a public mail domain is rejected with EMAIL_DOMAIN_NOT_ALLOWED', async () => {
    const res = await api().post('/api/auth/register').send(student({ email: 'test@gmail.com' }));

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('EMAIL_DOMAIN_NOT_ALLOWED');
    expect(res.body.error.message).toBe('Дозволено реєстрацію лише з використанням університетської електронної пошти');
    expect(res.body.error.details).toEqual([{ field: 'email', code: 'EMAIL_DOMAIN_NOT_ALLOWED' }]);
    expect(await prisma.user.count()).toBe(0);
    expect(getOutbox()).toHaveLength(0);
  });

  it('US-06 sc.2 a .edu.ua domain that is not on the allow-list is rejected', async () => {
    const res = await api().post('/api/auth/register').send(student({ email: 'a@unknown.edu.ua' }));

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('EMAIL_DOMAIN_NOT_ALLOWED');
    expect(await prisma.user.count()).toBe(0);
  });

  it('US-06 sc.3 a repeated email, in any letter case, is rejected with EMAIL_TAKEN', async () => {
    await createUser({ email: 'user@university.edu.ua' });

    const res = await api().post('/api/auth/register').send(student({ email: 'USER@university.edu.ua' }));

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
    expect(res.body.error.message).toBe('Ця електронна пошта вже використовується');
    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.emailToken.count()).toBe(0);
    expect(getOutbox()).toHaveLength(0);
  });

  it('US-06 sc.3 INV-01 two concurrent registrations of one email: one 201, one 409, one account', async () => {
    const app = api();
    const results = await Promise.all([
      app.post('/api/auth/register').send(student()),
      app.post('/api/auth/register').send(student({ displayName: 'Інший Студент' })),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(results.find((r) => r.status === 409)!.body.error.code).toBe('EMAIL_TAKEN');
    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.emailToken.count()).toBe(1);
    expect(getOutbox()).toHaveLength(1);
  });

  it('US-06 rollback: when the token cannot be stored, no account is left', async () => {
    const other = await createUser({ email: 'other@university.edu.ua' });
    await prisma.emailToken.create({
      data: { userId: other.id, purpose: 'confirm_email', tokenHash: hashToken('fixed'), expiresAt: new Date(Date.now() + 1000) },
    });

    await expect(
      register(
        { role: 'student', email: 'user@university.edu.ua', displayName: 'Олена', password: 'secret-pass' },
        { generateToken: () => 'fixed' },
      ),
    ).rejects.toThrow();

    expect(await prisma.user.count({ where: { email: 'user@university.edu.ua' } })).toBe(0);
    expect(getOutbox()).toHaveLength(0);
  });

  it('US-06 validation: a short password and a missing name are VALIDATION_FAILED', async () => {
    const res = await api().post('/api/auth/register').send(student({ password: 'short', displayName: '' }));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(await prisma.user.count()).toBe(0);
  });

  it('US-06 too many registrations from one client are RATE_LIMITED', async () => {
    const app = api();
    let last = 0;
    for (let i = 0; i < 11; i += 1) {
      last = (await app.post('/api/auth/register').send(student({ email: 'test@gmail.com' }))).status;
    }
    expect(last).toBe(429);
  });
});

describe('POST /api/auth/register (customer, US-43 smoke)', () => {
  it('US-06 a customer may use any domain without the allow-list', async () => {
    const res = await api()
      .post('/api/auth/register')
      .send({ role: 'customer', email: 'owner@company.com', displayName: 'ФОП Іваненко', password: 'secret-pass' });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('customer');
  });
});

describe('GET /api/dev/outbox', () => {
  it('is hidden in production', async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const res = await api().get('/api/dev/outbox');
      expect(res.status).toBe(404);
    } finally {
      process.env.NODE_ENV = previous;
    }
  });
});
