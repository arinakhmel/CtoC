import { createHash, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import type { APIRequestContext } from '@playwright/test';
import { createTask, publishTask, verifyStudent } from './moderation-api';

/**
 * The accounts of the e2e journeys are written straight into the e2e database (`apps/api/data/e2e.db`, the file the config gives
 * the API) with a session, because registering and confirming an email by hand is not what a journey tests (and sign-ups are rate
 * limited). What the moderator decides goes through the real API: the student is verified by an upload and a moderator's approval
 * (US-08, US-39), the task is created by the customer and published by the moderator (US-16, US-40), so the commission snapshot is
 * the one production takes. Only what is outside these steps (the executor, the escrow and the submitted result of a task under
 * review) is still written to the database. Emails are unique per run, so a spec does not depend on a reset.
 */
const db = new PrismaClient({ datasources: { db: { url: `file:${resolve(process.cwd(), 'apps/api/data/e2e.db')}?connection_limit=1` } } });

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export async function userWithSession(role: 'student' | 'customer' | 'moderator', stamp: number) {
  const user = await db.user.create({
    data: {
      email: `finance-e2e-${role}-${stamp}-${randomUUID().slice(0, 8)}@${role === 'student' ? 'university.edu.ua' : role === 'moderator' ? 'ctoc.local' : 'company.com'}`,
      passwordHash: 'not-a-real-hash',
      displayName: role === 'student' ? 'Студент' : role === 'moderator' ? 'Модератор' : 'Замовник',
      role,
      emailConfirmedAt: new Date(),
    },
  });
  const sid = `finance-e2e-${role}-${randomUUID()}`;
  await db.session.create({ data: { id: sha256(sid), userId: user.id, expiresAt: new Date(Date.now() + 3600_000) } });
  return { id: user.id, email: user.email, sid };
}

export interface ReviewTaskSeed {
  title: string;
  priceKopecks: number;
}

/**
 * A student, a customer and tasks under review, as the real flow leaves them: price held, split snapshotted, result submitted.
 * The student is verified and each task is published through the API; the commission split is the one the moderator's publish took.
 */
export async function seedTasksInReview(request: APIRequestContext, tasks: ReviewTaskSeed[]) {
  const stamp = Date.now();
  const student = await userWithSession('student', stamp);
  const customer = await userWithSession('customer', stamp);
  const moderator = await seedModerator();
  await verifyStudent(request, student, moderator);
  const total = tasks.reduce((sum, task) => sum + task.priceKopecks, 0);
  await db.balance.create({ data: { ownerId: customer.id, availableKopecks: 0 } });
  await db.ledgerEntry.create({ data: { ownerId: customer.id, kind: 'topup', amountKopecks: total } });
  const ids: string[] = [];
  for (const seed of tasks) {
    const taskId = await createTask(request, customer, { ...seed, description: 'Завдання для перевірки сторінки фінансів.' });
    await publishTask(request, moderator, taskId);
    // Apply, assign and delivery are other steps: the published task moves to `in_review` with its executor here.
    const task = await db.task.update({ where: { id: taskId }, data: { status: 'in_review', executorId: student.id, assignedAt: new Date() } });
    await db.escrow.create({ data: { taskId: task.id, customerId: customer.id, amountKopecks: seed.priceKopecks, status: 'held', idempotencyKey: randomUUID() } });
    await db.ledgerEntry.create({ data: { ownerId: customer.id, kind: 'hold', amountKopecks: -seed.priceKopecks, taskId: task.id } });
    await db.resultVersion.create({ data: { taskId: task.id, version: 1, status: 'submitted', submittedAt: new Date() } });
    ids.push(task.id);
  }
  return { student, customer, taskIds: ids };
}

/** A moderator with a session (A-10, US-39, US-40): no API makes a moderator account, and `pnpm db:seed` is not part of the e2e run. */
export const seedModerator = () => userWithSession('moderator', Date.now());

export const closeSeed = () => db.$disconnect();
