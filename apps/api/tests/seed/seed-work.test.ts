import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  assertSafeTarget,
  planWorkData,
  SEED_COMMISSION_BP,
  SEED_CUSTOMER_EMAIL,
  SEED_STUDENT_EMAIL,
  SEED_TASK_TITLE,
  seedWorkData,
} from '../../src/seed/dev-work';
import { api } from '../helpers/app';
import { prisma, resetDb } from '../helpers/db';
import { createFile, createUser } from '../helpers/factories';

const ORIGIN = 'http://localhost:5173';
// Generated for each run: no password is written in the repository.
let passwords: { student: string; customer: string };

const counts = async () => ({
  users: await prisma.user.count(),
  tasks: await prisma.task.count(),
  applications: await prisma.application.count(),
  escrows: await prisma.escrow.count(),
  ledger: await prisma.ledgerEntry.count(),
  notifications: await prisma.notification.count(),
  audit: await prisma.auditEvent.count(),
});

beforeEach(async () => {
  await resetDb();
  passwords = { student: `s-${randomUUID()}`, customer: `c-${randomUUID()}` };
});

describe('db:seed:work (development data for Epic 5)', () => {
  it('creates a verified student and a customer with a task assigned to the student, through the real services', async () => {
    const report = await seedWorkData(prisma, passwords);

    const student = await prisma.user.findUniqueOrThrow({ where: { email: SEED_STUDENT_EMAIL } });
    const customer = await prisma.user.findUniqueOrThrow({ where: { email: SEED_CUSTOMER_EMAIL } });
    expect(student).toMatchObject({ role: 'student' });
    expect(student.emailConfirmedAt).not.toBeNull();
    expect(student.studentVerifiedAt).not.toBeNull();
    expect(customer).toMatchObject({ role: 'customer', studentVerifiedAt: null });
    expect(customer.emailConfirmedAt).not.toBeNull();

    const task = await prisma.task.findFirstOrThrow({ where: { title: SEED_TASK_TITLE } });
    expect(report.taskId).toBe(task.id);
    expect(task).toMatchObject({ customerId: customer.id, executorId: student.id, status: 'in_progress', priceKopecks: 50_000 });
    expect(task.assignedAt).not.toBeNull();
    expect(task.deadlineAt.getTime()).toBeGreaterThan(Date.now());
    // The development commission snapshot (10 %), consistent: commission + net = price (INV-08).
    expect(task).toMatchObject({ commissionBp: SEED_COMMISSION_BP, commissionKopecks: 5_000, netKopecks: 45_000 });

    // The real assignment ran: application accepted, escrow held with the full price, one hold entry, a notification.
    expect(await prisma.application.findFirstOrThrow({ where: { taskId: task.id } })).toMatchObject({ studentId: student.id, status: 'accepted' });
    expect(await prisma.escrow.findFirstOrThrow({ where: { taskId: task.id } })).toMatchObject({ status: 'held', amountKopecks: 50_000 });
    expect(await prisma.notification.findFirstOrThrow({ where: { userId: student.id } })).toMatchObject({ type: 'executor_selected' });

    // INV-20: the balance equals the sum of the ledger entries.
    const entries = await prisma.ledgerEntry.findMany({ where: { ownerId: customer.id } });
    const balance = await prisma.balance.findUniqueOrThrow({ where: { ownerId: customer.id } });
    expect(balance.availableKopecks).toBe(entries.reduce((sum, entry) => sum + entry.amountKopecks, 0));
    expect(balance.availableKopecks).toBe(50_000);
    expect(entries.map((entry) => entry.kind).sort()).toEqual(['hold', 'topup']);

    expect(await prisma.auditEvent.findFirstOrThrow({ where: { entityId: student.id } })).toMatchObject({ action: 'verification.approved' });
  });

  it('the seed student and customer can really log in; the student sees the task in «Мої активні завдання» and can upload (US-27)', async () => {
    await seedWorkData(prisma, passwords);

    const login = await api().post('/api/auth/login').set('Origin', ORIGIN).send({ email: SEED_STUDENT_EMAIL, password: passwords.student });
    expect(login.status).toBe(200);
    const cookie = String(login.headers['set-cookie']?.[0]).split(';')[0]!;

    const work = await api().get('/api/me/work').set('Cookie', cookie);
    expect(work.status).toBe(200);
    expect(work.body.tasks).toHaveLength(1);
    expect(work.body.tasks[0]).toMatchObject({ title: SEED_TASK_TITLE, status: 'in_progress' });

    const upload = await api()
      .post(`/api/tasks/${work.body.tasks[0].id}/result/files`)
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .attach('file', Buffer.from('%PDF-1.4\nseed'), { filename: 'seed.pdf', contentType: 'application/pdf' });
    expect(upload.status).toBe(201);

    const customer = await api().post('/api/auth/login').set('Origin', ORIGIN).send({ email: SEED_CUSTOMER_EMAIL, password: passwords.customer });
    expect(customer.status).toBe(200);
  });

  it('is idempotent: a second run adds nothing and does not charge or notify again', async () => {
    await seedWorkData(prisma, passwords);
    const first = await counts();
    const balance = await prisma.balance.findFirstOrThrow({ where: { ownerId: { not: 'platform' } } });

    const again = await seedWorkData(prisma, passwords);

    expect(await counts()).toEqual(first);
    expect((await prisma.balance.findFirstOrThrow({ where: { ownerId: balance.ownerId } })).availableKopecks).toBe(balance.availableKopecks);
    expect(again.lines.join('\n')).toContain('already exists, not changed');
  });

  it('a second run needs no password: existing accounts are left as they are', async () => {
    await seedWorkData(prisma, passwords);

    await expect(seedWorkData(prisma, {})).resolves.toBeDefined();
  });

  it('a password is required only to create an account, and is checked: missing or too short stops before writing', async () => {
    await expect(seedWorkData(prisma, { customer: passwords.customer })).rejects.toThrow(/SEED_STUDENT_PASSWORD is required/);
    await expect(seedWorkData(prisma, { student: 'short', customer: passwords.customer })).rejects.toThrow(/at least 8 characters/);
    expect(await prisma.task.count()).toBe(0);
  });

  it('never prints a password: the report holds none', async () => {
    const report = await seedWorkData(prisma, passwords);

    const text = JSON.stringify(report) + (await planWorkData(prisma)).join('\n');
    expect(text).not.toContain(passwords.student);
    expect(text).not.toContain(passwords.customer);
  });

  it('does not touch a real local account or its pending verification request', async () => {
    const mine = await createUser({ email: 'my.real.account@university.edu.ua' });
    const file = await createFile(mine.id);
    const pending = await prisma.verificationRequest.create({ data: { userId: mine.id, fileId: file.id, status: 'pending' } });
    const before = { user: await prisma.user.findUniqueOrThrow({ where: { id: mine.id } }), request: pending };

    await seedWorkData(prisma, passwords);
    await seedWorkData(prisma, passwords);

    expect(await prisma.user.findUniqueOrThrow({ where: { id: mine.id } })).toEqual(before.user);
    expect(await prisma.verificationRequest.findUniqueOrThrow({ where: { id: pending.id } })).toEqual(before.request);
    expect(before.user.studentVerifiedAt).toBeNull();
  });

  it('never changes an existing seed account: an unverified student of that email stops the run, unchanged', async () => {
    const existing = await createUser({ email: SEED_STUDENT_EMAIL });

    await expect(seedWorkData(prisma, passwords)).rejects.toThrow(/not a verified student/);

    expect(await prisma.user.findUniqueOrThrow({ where: { id: existing.id } })).toEqual(existing);
    expect(await prisma.task.count()).toBe(0);
  });

  it('dry-run reads only: it describes the steps and writes nothing', async () => {
    const before = await counts();

    const plan = await planWorkData(prisma);

    expect(await counts()).toEqual(before);
    expect(plan.join('\n')).toContain('will be created');
  });

  it('dry-run after seeding says there is nothing to do', async () => {
    await seedWorkData(prisma, passwords);

    expect((await planWorkData(prisma)).join('\n')).toContain('already assigned to the student, nothing to do');
  });
});

describe('db:seed:work refuses production and servers', () => {
  const local = { DATABASE_URL: 'file:../data/ctoc.db?connection_limit=1' };

  it('accepts a local SQLite file and returns the file it would use', () => {
    expect(assertSafeTarget(local)).toMatch(/data[\\/]ctoc\.db$/);
  });

  it.each([
    ['NODE_ENV=production', { ...local, NODE_ENV: 'production' }, /NODE_ENV is production/],
    ['a Railway variable', { ...local, RAILWAY_ENVIRONMENT: 'production' }, /Railway/],
    ['a database that is not a file', { DATABASE_URL: 'postgres://u:p@host/db' }, /not a local SQLite file/],
    ['no DATABASE_URL', {}, /not a local SQLite file/],
    ['the absolute server volume path', { DATABASE_URL: 'file:/data/ctoc.db?connection_limit=1' }, /absolute server path/],
  ])('refuses %s', (_name, env, message) => {
    expect(() => assertSafeTarget(env as NodeJS.ProcessEnv)).toThrow(message);
  });
});
