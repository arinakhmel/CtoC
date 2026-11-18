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
import { createFile, createTask, createUser } from '../helpers/factories';

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

  it('never changes an existing seed account: a confirmed but unverified student of that email stops the run, unchanged', async () => {
    const existing = await prisma.user.update({ where: { id: (await createUser({ email: SEED_STUDENT_EMAIL })).id }, data: { emailConfirmedAt: new Date() } });

    await expect(seedWorkData(prisma, passwords)).rejects.toThrow(/not a verified student/);

    expect(await prisma.user.findUniqueOrThrow({ where: { id: existing.id } })).toEqual(existing);
    expect(await prisma.task.count()).toBe(0);
  });

  it('never changes an existing seed account: one whose email is not confirmed stops the run, unchanged', async () => {
    const existing = await createUser({ email: SEED_STUDENT_EMAIL }); // the factory leaves emailConfirmedAt empty
    expect(existing.emailConfirmedAt).toBeNull();

    await expect(seedWorkData(prisma, passwords)).rejects.toThrow(/email is not confirmed/);

    expect(await prisma.user.findUniqueOrThrow({ where: { id: existing.id } })).toEqual(existing);
    expect(await prisma.task.count()).toBe(0);
  });

  it('an existing seed customer with an unconfirmed email also stops the run, unchanged', async () => {
    const student = await seedWorkData(prisma, passwords); // everything in place first
    expect(student.taskId).not.toBeNull();
    const customer = await prisma.user.update({ where: { email: SEED_CUSTOMER_EMAIL }, data: { emailConfirmedAt: null } });

    await expect(seedWorkData(prisma, {})).rejects.toThrow(/email is not confirmed/);

    expect(await prisma.user.findUniqueOrThrow({ where: { id: customer.id } })).toEqual(customer);
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

describe('db:seed:work --new-task (a fresh assigned task for repeating a manual check)', () => {
  const customerLedgerSum = async () => {
    const customer = await prisma.user.findUniqueOrThrow({ where: { email: SEED_CUSTOMER_EMAIL } });
    const entries = await prisma.ledgerEntry.findMany({ where: { ownerId: customer.id } });
    const balance = await prisma.balance.findUniqueOrThrow({ where: { ownerId: customer.id } });
    return { balance: balance.availableKopecks, sum: entries.reduce((total, entry) => total + entry.amountKopecks, 0) };
  };

  it('adds a numbered task assigned to the student when the first task has already moved on (in review), and leaves the first untouched', async () => {
    await seedWorkData(prisma, passwords);
    const first = await prisma.task.findFirstOrThrow({ where: { title: SEED_TASK_TITLE } });
    await prisma.task.update({ where: { id: first.id }, data: { status: 'in_review' } }); // as after a manual test of US-28
    const firstBefore = await prisma.task.findUniqueOrThrow({ where: { id: first.id } });

    const report = await seedWorkData(prisma, passwords, { newTask: true });

    const added = await prisma.task.findUniqueOrThrow({ where: { id: report.taskId! } });
    const student = await prisma.user.findUniqueOrThrow({ where: { email: SEED_STUDENT_EMAIL } });
    expect(added.id).not.toBe(first.id);
    expect(added).toMatchObject({ title: '[Тест] Завдання для ручної перевірки №2', status: 'in_progress', executorId: student.id, priceKopecks: 50_000 });
    expect(added).toMatchObject({ commissionBp: SEED_COMMISSION_BP, commissionKopecks: 5_000, netKopecks: 45_000 });
    expect(await prisma.escrow.findFirstOrThrow({ where: { taskId: added.id } })).toMatchObject({ status: 'held', amountKopecks: 50_000 });
    expect(await prisma.notification.count({ where: { userId: student.id, type: 'executor_selected' } })).toBe(2);
    expect(await prisma.task.findUniqueOrThrow({ where: { id: first.id } })).toEqual(firstBefore); // the first task did not change
    const money = await customerLedgerSum();
    expect(money.balance).toBe(money.sum); // INV-20 holds after the second hold
  });

  it('a student can log in and see the new task in «Мої активні завдання», next to the first, ready to work on', async () => {
    await seedWorkData(prisma, passwords);
    await seedWorkData(prisma, passwords, { newTask: true });
    const login = await api().post('/api/auth/login').set('Origin', ORIGIN).send({ email: SEED_STUDENT_EMAIL, password: passwords.student });
    const cookie = String(login.headers['set-cookie']?.[0]).split(';')[0]!;

    const work = await api().get('/api/me/work').set('Cookie', cookie);

    expect(work.body.tasks.map((task: { title: string }) => task.title).sort()).toEqual([SEED_TASK_TITLE, '[Тест] Завдання для ручної перевірки №2'].sort());
    expect(work.body.tasks.every((task: { status: string }) => task.status === 'in_progress')).toBe(true);
  });

  it('each run with the flag adds one more task: №2, then №3, each with its own escrow and balance consistent', async () => {
    await seedWorkData(prisma, passwords, { newTask: true }); // on an empty database: the first task and №2
    await seedWorkData(prisma, passwords, { newTask: true });

    const titles = (await prisma.task.findMany({ select: { title: true }, orderBy: { createdAt: 'asc' } })).map((task) => task.title);
    expect(titles).toEqual([SEED_TASK_TITLE, '[Тест] Завдання для ручної перевірки №2', '[Тест] Завдання для ручної перевірки №3']);
    expect(await prisma.escrow.count({ where: { status: 'held' } })).toBe(3);
    const money = await customerLedgerSum();
    expect(money.balance).toBe(money.sum);
  });

  it('without the flag nothing is added, however often it runs', async () => {
    await seedWorkData(prisma, passwords, { newTask: true });
    const before = await counts();

    await seedWorkData(prisma, passwords);
    await seedWorkData(prisma, passwords, {});

    expect(await counts()).toEqual(before);
  });

  it('does not touch a real local account, its pending verification request or its data', async () => {
    const mine = await createUser({ email: 'my.real.account@university.edu.ua' });
    const file = await createFile(mine.id);
    const pending = await prisma.verificationRequest.create({ data: { userId: mine.id, fileId: file.id, status: 'pending' } });
    const before = { user: await prisma.user.findUniqueOrThrow({ where: { id: mine.id } }), request: pending };

    await seedWorkData(prisma, passwords, { newTask: true });
    await seedWorkData(prisma, passwords, { newTask: true });

    expect(await prisma.user.findUniqueOrThrow({ where: { id: mine.id } })).toEqual(before.user);
    expect(await prisma.verificationRequest.findUniqueOrThrow({ where: { id: pending.id } })).toEqual(before.request);
    expect(await prisma.task.count({ where: { OR: [{ customerId: mine.id }, { executorId: mine.id }] } })).toBe(0);
  });

  it('dry-run with the flag reads only: it names the new task and writes nothing', async () => {
    await seedWorkData(prisma, passwords);
    const before = await counts();

    const plan = (await planWorkData(prisma, { newTask: true })).join('\n');

    expect(await counts()).toEqual(before);
    expect(plan).toContain('new task: "[Тест] Завдання для ручної перевірки №2" will be created');
    expect(plan).not.toContain(passwords.student);
  });

  it('refuses to create more than 20 test tasks and then creates nothing', async () => {
    await seedWorkData(prisma, passwords);
    const customer = await prisma.user.findUniqueOrThrow({ where: { email: SEED_CUSTOMER_EMAIL } });
    for (let i = 2; i <= 20; i += 1) await createTask(customer.id, { title: `[Тест] Завдання для ручної перевірки №${i}` });
    const before = await counts();

    await expect(seedWorkData(prisma, passwords, { newTask: true })).rejects.toThrow(/more than 20 test tasks/);

    expect(await counts()).toEqual(before);
    expect((await planWorkData(prisma, { newTask: true })).join('\n')).toContain('more than 20 test tasks');
  });

  it('still refuses production, Railway, a non-file database and an absolute server path (the guard is not bypassed by the flag)', () => {
    expect(() => assertSafeTarget({ DATABASE_URL: 'file:../data/ctoc.db', NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toThrow(/production/);
    expect(() => assertSafeTarget({ DATABASE_URL: 'file:../data/ctoc.db', RAILWAY_ENVIRONMENT: 'x' } as NodeJS.ProcessEnv)).toThrow(/Railway/);
    expect(() => assertSafeTarget({ DATABASE_URL: 'postgres://u@h/d' } as NodeJS.ProcessEnv)).toThrow(/not a local SQLite file/);
    expect(() => assertSafeTarget({ DATABASE_URL: 'file:/data/ctoc.db' } as NodeJS.ProcessEnv)).toThrow(/absolute server path/);
  });
});

describe('db:seed:work --new-task leaves existing tasks as they are', () => {
  /** The two seed accounts exist (so no password is needed), and the first test task is still `published`: an interrupted run. */
  async function interruptedRun() {
    const student = await prisma.user.create({
      data: { email: SEED_STUDENT_EMAIL, passwordHash: 'x', displayName: 'Тестовий Студент', role: 'student', emailConfirmedAt: new Date(), studentVerifiedAt: new Date() },
    });
    const customer = await prisma.user.create({
      data: { email: SEED_CUSTOMER_EMAIL, passwordHash: 'x', displayName: 'Тестовий Замовник', role: 'customer', emailConfirmedAt: new Date() },
    });
    const base = await createTask(customer.id, { title: SEED_TASK_TITLE, status: 'published', publishedAt: new Date() });
    return { student, customer, base };
  }

  it('with the flag an interrupted first task is not advanced: it stays published, with no application, and the new task is added', async () => {
    const { base } = await interruptedRun();
    const before = await prisma.task.findUniqueOrThrow({ where: { id: base.id } });

    const report = await seedWorkData(prisma, {}, { newTask: true });

    expect(await prisma.task.findUniqueOrThrow({ where: { id: base.id } })).toEqual(before);
    expect(await prisma.application.count({ where: { taskId: base.id } })).toBe(0);
    expect(await prisma.escrow.count({ where: { taskId: base.id } })).toBe(0);
    const added = await prisma.task.findUniqueOrThrow({ where: { id: report.taskId! } });
    expect(added).toMatchObject({ title: '[Тест] Завдання для ручної перевірки №2', status: 'in_progress' });
    expect(report.lines.join('\n')).toContain('status published, left as it is');
  });

  it('without the flag the same interrupted first task is finished, as documented', async () => {
    const { base, student } = await interruptedRun();

    await seedWorkData(prisma, {});

    expect(await prisma.task.findUniqueOrThrow({ where: { id: base.id } })).toMatchObject({ status: 'in_progress', executorId: student.id });
  });

  it('the dry-run names the same task as the run when the first task is still to be created', async () => {
    const student = await prisma.user.create({
      data: { email: SEED_STUDENT_EMAIL, passwordHash: 'x', displayName: 'Тестовий Студент', role: 'student', emailConfirmedAt: new Date(), studentVerifiedAt: new Date() },
    });
    await prisma.user.create({
      data: { email: SEED_CUSTOMER_EMAIL, passwordHash: 'x', displayName: 'Тестовий Замовник', role: 'customer', emailConfirmedAt: new Date() },
    });

    const plan = (await planWorkData(prisma, { newTask: true })).join('\n');
    const report = await seedWorkData(prisma, {}, { newTask: true });

    expect(plan).toContain('new task: "[Тест] Завдання для ручної перевірки №2" will be created');
    const titles = (await prisma.task.findMany({ select: { title: true }, orderBy: { createdAt: 'asc' } })).map((task) => task.title);
    expect(titles).toEqual([SEED_TASK_TITLE, '[Тест] Завдання для ручної перевірки №2']); // the plan named №2, the run created №2
    expect((await prisma.task.findUniqueOrThrow({ where: { id: report.taskId! } })).executorId).toBe(student.id);
  });

  it('at the limit of 20 the run refuses before anything is written: the interrupted first task is not advanced either', async () => {
    const { base, customer } = await interruptedRun();
    for (let i = 2; i <= 20; i += 1) await createTask(customer.id, { title: `[Тест] Завдання для ручної перевірки №${i}` });
    const before = await counts();
    const baseBefore = await prisma.task.findUniqueOrThrow({ where: { id: base.id } });

    await expect(seedWorkData(prisma, {}, { newTask: true })).rejects.toThrow(/more than 20 test tasks/);

    expect(await counts()).toEqual(before);
    expect(await prisma.task.findUniqueOrThrow({ where: { id: base.id } })).toEqual(baseBefore);
    expect(await prisma.application.count()).toBe(0);
  });
});

describe('db:seed:work --new-task checks the limit before it creates an account', () => {
  /** The limit counts the tasks of the test customer, so it can be reached only when that customer exists: here without the student. */
  async function customerAtTheLimitWithoutStudent() {
    const customer = await prisma.user.create({
      data: { email: SEED_CUSTOMER_EMAIL, passwordHash: 'x', displayName: 'Тестовий Замовник', role: 'customer', emailConfirmedAt: new Date() },
    });
    await createTask(customer.id, { title: SEED_TASK_TITLE });
    for (let i = 2; i <= 20; i += 1) await createTask(customer.id, { title: `[Тест] Завдання для ручної перевірки №${i}` });
    return customer;
  }

  it('at the limit, with the student missing, it refuses and creates nothing: no student, no task, no money, no audit event', async () => {
    await customerAtTheLimitWithoutStudent();
    const before = await counts();

    await expect(seedWorkData(prisma, passwords, { newTask: true })).rejects.toThrow(/more than 20 test tasks/);

    expect(await counts()).toEqual(before);
    expect(await prisma.user.findUnique({ where: { email: SEED_STUDENT_EMAIL } })).toBeNull();
    expect(await prisma.balance.count()).toBe(0);
  });

  it('the same without any password: the refusal is the limit, not a missing password, and still nothing is written', async () => {
    await customerAtTheLimitWithoutStudent();
    const before = await counts();

    await expect(seedWorkData(prisma, {}, { newTask: true })).rejects.toThrow(/more than 20 test tasks/);

    expect(await counts()).toEqual(before);
  });

  it('below the limit the missing student is created and the new task is added, as before', async () => {
    const customer = await prisma.user.create({
      data: { email: SEED_CUSTOMER_EMAIL, passwordHash: 'x', displayName: 'Тестовий Замовник', role: 'customer', emailConfirmedAt: new Date() },
    });
    await createTask(customer.id, { title: SEED_TASK_TITLE });

    const report = await seedWorkData(prisma, passwords, { newTask: true });

    expect(await prisma.user.findUnique({ where: { email: SEED_STUDENT_EMAIL } })).not.toBeNull();
    expect((await prisma.task.findUniqueOrThrow({ where: { id: report.taskId! } })).title).toBe('[Тест] Завдання для ручної перевірки №2');
  });
});
