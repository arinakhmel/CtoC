// Infrastructure tests for docs/architecture/data-model.md: the rules that the schema itself must
// enforce (§2) are checked against the real SQLite test database, built from the committed migrations.
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { disconnectDb, prisma, resetDb } from './helpers/db';
import { createApplication, createFile, createTask, createUser } from './helpers/factories';

beforeEach(resetDb);
afterAll(disconnectDb);

const UNIQUE_VIOLATION = { code: 'P2002' };

describe('data-model.md §2 INV-01: users.email', () => {
  it('US-06 sc.3: the same email twice is rejected', async () => {
    await createUser({ email: 'user@university.edu.ua' });
    await expect(createUser({ email: 'user@university.edu.ua' })).rejects.toMatchObject(UNIQUE_VIOLATION);
  });

  it('US-06 sc.3: emails are unique ignoring case', async () => {
    await createUser({ email: 'user@university.edu.ua' });
    await expect(createUser({ email: 'User@University.EDU.UA' })).rejects.toThrow(/unique|constraint/i);
  });
});

describe('data-model.md §2 INV-09: applications (taskId, studentId)', () => {
  it('US-18 sc.2: one student cannot apply twice to the same task, but can apply to another task', async () => {
    const customer = await createUser({ role: 'customer', email: 'owner@company.com' });
    const student = await createUser();
    const [task1, task2] = await Promise.all([createTask(customer.id), createTask(customer.id)]);
    await createApplication(task1.id, student.id);
    await expect(createApplication(task1.id, student.id)).rejects.toMatchObject(UNIQUE_VIOLATION);
    await expect(createApplication(task2.id, student.id)).resolves.toBeTruthy();
  });
});

describe('data-model.md §2 INV-10: one accepted application per task', () => {
  it('US-25 sc.2: a second accepted application on the same task is rejected', async () => {
    const customer = await createUser({ role: 'customer', email: 'owner@company.com' });
    const [a, b] = await Promise.all([createUser(), createUser()]);
    const task = await createTask(customer.id);
    await createApplication(task.id, a.id, { status: 'accepted' });
    await expect(createApplication(task.id, b.id, { status: 'accepted' })).rejects.toThrow(/unique|constraint/i);
    await expect(createApplication(task.id, b.id, { status: 'rejected' })).resolves.toBeTruthy();
  });
});

describe('data-model.md §2 INV-04: one pending verification request per user', () => {
  it('US-08: a second pending request is rejected, a new one is allowed after a decision', async () => {
    const student = await createUser();
    const file = await createFile(student.id);
    const first = await prisma.verificationRequest.create({ data: { userId: student.id, fileId: file.id, status: 'pending' } });
    await expect(
      prisma.verificationRequest.create({ data: { userId: student.id, fileId: file.id, status: 'pending' } }),
    ).rejects.toThrow(/unique|constraint/i);
    await prisma.verificationRequest.update({ where: { id: first.id }, data: { status: 'rejected', reason: 'Нечитабельний скан' } });
    await expect(
      prisma.verificationRequest.create({ data: { userId: student.id, fileId: file.id, status: 'pending' } }),
    ).resolves.toBeTruthy();
  });
});

describe('data-model.md §2 INV-12 and INV-19: one escrow and one payout per task', () => {
  it('US-26 sc.3: a second escrow for the same task is rejected', async () => {
    const customer = await createUser({ role: 'customer', email: 'owner@company.com' });
    const task = await createTask(customer.id);
    const escrow = (key: string) =>
      prisma.escrow.create({
        data: { taskId: task.id, customerId: customer.id, amountKopecks: 50_000, status: 'held', idempotencyKey: key },
      });
    await escrow('key-1');
    await expect(escrow('key-2')).rejects.toMatchObject(UNIQUE_VIOLATION);
  });

  it('US-34 sc.3: a second payout entry for the same task is rejected', async () => {
    const customer = await createUser({ role: 'customer', email: 'owner@company.com' });
    const student = await createUser();
    const task = await createTask(customer.id);
    const payout = () =>
      prisma.ledgerEntry.create({ data: { ownerId: student.id, kind: 'payout', amountKopecks: 45_000, taskId: task.id } });
    await payout();
    await expect(payout()).rejects.toThrow(/unique|constraint/i);
  });
});

describe('data-model.md §2 CHECK constraints', () => {
  it('US-15 sc.2: a task price of 0 or less is rejected by the database', async () => {
    const customer = await createUser({ role: 'customer', email: 'owner@company.com' });
    await expect(createTask(customer.id, { priceKopecks: 0 })).rejects.toThrow(/constraint/i);
  });

  it('INV-08: commission plus net must equal the price', async () => {
    const customer = await createUser({ role: 'customer', email: 'owner@company.com' });
    await expect(
      createTask(customer.id, { priceKopecks: 100_000, commissionBp: 1000, commissionKopecks: 10_000, netKopecks: 80_000 }),
    ).rejects.toThrow(/constraint/i);
    await expect(
      createTask(customer.id, { priceKopecks: 100_000, commissionBp: 1000, commissionKopecks: 10_000, netKopecks: 90_000 }),
    ).resolves.toBeTruthy();
  });

  it('domain-model.md §3.1: a task status outside the list is rejected', async () => {
    const customer = await createUser({ role: 'customer', email: 'owner@company.com' });
    await expect(createTask(customer.id, { status: 'archived' })).rejects.toThrow(/constraint/i);
  });

  it('domain-model.md §3.1: a task in work must have an executor', async () => {
    const customer = await createUser({ role: 'customer', email: 'owner@company.com' });
    await expect(createTask(customer.id, { status: 'in_progress' })).rejects.toThrow(/constraint/i);
  });

  it('US-36 sc.3, INV-20: a balance can never be negative', async () => {
    const student = await createUser();
    await expect(prisma.balance.create({ data: { ownerId: student.id, availableKopecks: -1 } })).rejects.toThrow(/constraint/i);
  });

  it('US-10 and US-44: only students can be verified, and the display name has 2 to 60 characters', async () => {
    await expect(
      prisma.user.create({ data: { email: 'c@company.com', passwordHash: 'x', displayName: 'Customer', role: 'customer', studentVerifiedAt: new Date() } }),
    ).rejects.toThrow(/constraint/i);
    await expect(
      prisma.user.create({ data: { email: 'd@company.com', passwordHash: 'x', displayName: 'D', role: 'customer' } }),
    ).rejects.toThrow(/constraint/i);
  });
});

describe('resetDb helper (testing.md §3)', () => {
  it('empties every table and keeps the schema', async () => {
    await createUser();
    expect(await prisma.user.count()).toBe(1);
    await resetDb();
    expect(await prisma.user.count()).toBe(0);
    await expect(createUser()).resolves.toBeTruthy();
  });
});
