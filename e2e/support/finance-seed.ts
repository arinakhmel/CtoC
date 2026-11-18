import { createHash, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

/**
 * The accounts and tasks of the finance journey, written straight into the e2e database (`apps/api/data/e2e.db`, the file the
 * config gives the API). There is no API for two things this journey needs: approving a student (US-39 is not built, it is only
 * possible through Telegram) and publishing a task (US-40). Everything after that, the accept and the payout, goes through
 * the real endpoint in the spec. Emails are unique per run, so the spec does not depend on a reset.
 */
const db = new PrismaClient({ datasources: { db: { url: `file:${resolve(process.cwd(), 'apps/api/data/e2e.db')}?connection_limit=1` } } });

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

async function userWithSession(role: 'student' | 'customer', stamp: number) {
  const user = await db.user.create({
    data: {
      email: `finance-e2e-${role}-${stamp}@${role === 'student' ? 'university.edu.ua' : 'company.com'}`,
      passwordHash: 'not-a-real-hash',
      displayName: role === 'student' ? 'Студент' : 'Замовник',
      role,
      emailConfirmedAt: new Date(),
      studentVerifiedAt: role === 'student' ? new Date() : null,
    },
  });
  const sid = `finance-e2e-${role}-${randomUUID()}`;
  await db.session.create({ data: { id: sha256(sid), userId: user.id, expiresAt: new Date(Date.now() + 3600_000) } });
  return { id: user.id, sid };
}

export interface ReviewTaskSeed {
  title: string;
  priceKopecks: number;
  commissionKopecks: number;
}

/** A student, a customer and tasks under review, as the real flow leaves them: price held, split snapshotted, result submitted. */
export async function seedTasksInReview(tasks: ReviewTaskSeed[]) {
  const stamp = Date.now();
  const student = await userWithSession('student', stamp);
  const customer = await userWithSession('customer', stamp);
  const total = tasks.reduce((sum, task) => sum + task.priceKopecks, 0);
  await db.balance.create({ data: { ownerId: customer.id, availableKopecks: 0 } });
  await db.ledgerEntry.create({ data: { ownerId: customer.id, kind: 'topup', amountKopecks: total } });
  const ids: string[] = [];
  for (const [index, seed] of tasks.entries()) {
    const task = await db.task.create({
      data: {
        customerId: customer.id,
        title: seed.title,
        description: 'Завдання для перевірки сторінки фінансів.',
        priceKopecks: seed.priceKopecks,
        deadlineAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
        status: 'in_review',
        executorId: student.id,
        publishedAt: new Date(Date.now() - (tasks.length - index) * 60_000),
        assignedAt: new Date(),
        commissionBp: 1000,
        commissionKopecks: seed.commissionKopecks,
        netKopecks: seed.priceKopecks - seed.commissionKopecks,
      },
    });
    await db.escrow.create({ data: { taskId: task.id, customerId: customer.id, amountKopecks: seed.priceKopecks, status: 'held', idempotencyKey: randomUUID() } });
    await db.ledgerEntry.create({ data: { ownerId: customer.id, kind: 'hold', amountKopecks: -seed.priceKopecks, taskId: task.id } });
    await db.resultVersion.create({ data: { taskId: task.id, version: 1, status: 'submitted', submittedAt: new Date() } });
    ids.push(task.id);
  }
  return { student, customer, taskIds: ids };
}

export const closeSeed = () => db.$disconnect();
