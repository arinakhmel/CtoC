import type { Prisma } from '@prisma/client';
import { prisma } from '../../platform/db';
import { CANCELLABLE_BY_OWNER, CANCELLED } from './domain';

/**
 * INV-06: the feed holds only published tasks that have no executor and a future deadline.
 * `publishedAt` is always set when a task is published, the extra condition only keeps the keyset order total.
 */
const feedWhere = (now: Date): Prisma.TaskWhereInput => ({
  status: 'published',
  executorId: null,
  deadlineAt: { gt: now },
  publishedAt: { not: null },
});

/**
 * The columns of a feed card and of the details page. The commission snapshot (US-15) is read as stored: it was taken
 * at publication, so the card shows what will be paid (NFR-20). It is never recomputed from today's rate.
 */
const cardSelect = {
  id: true,
  title: true,
  description: true,
  priceKopecks: true,
  commissionKopecks: true,
  netKopecks: true,
  deadlineAt: true,
  publishedAt: true,
} satisfies Prisma.TaskSelect;

/** US-13. One task as the student may open it: the same visibility as the feed (INV-06). Anything else is absent. */
export const findOpenTask = (id: string, now: Date) =>
  prisma.task.findFirst({ where: { id, ...feedWhere(now) }, select: cardSelect });

/**
 * US-18. Runs on the transaction client. A conditional write, not a read: it takes the SQLite write lock at the first
 * statement of the transaction (a deferred BEGIN would otherwise lock only at the insert, after the check), and its
 * `count` says whether the task is still open at this moment (ADR-0007 §1). It sets `status` to the value the row
 * already has, so the only side effect is `updatedAt`.
 */
export const lockOpenTask = (tx: Prisma.TransactionClient, id: string, now: Date) =>
  tx.task.updateMany({ where: { id, ...feedWhere(now) }, data: { status: 'published' } });

/** Any task that was published, even if it has left the feed since (assigned, expired), so paging never breaks mid-way. */
export const findFeedCursor = (id: string) =>
  prisma.task.findFirst({ where: { id, publishedAt: { not: null } }, select: { id: true, publishedAt: true } });

/** Newest first. Keyset pagination on (publishedAt, id), so a task published meanwhile never shifts a page. */
export function listFeed(now: Date, limit: number, after?: { id: string; publishedAt: Date }) {
  const where: Prisma.TaskWhereInput = after
    ? {
        AND: [
          feedWhere(now),
          { OR: [{ publishedAt: { lt: after.publishedAt } }, { publishedAt: after.publishedAt, id: { lt: after.id } }] },
        ],
      }
    : feedWhere(now);
  return prisma.task.findMany({
    where,
    orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
    take: limit + 1, // one extra row tells whether there is a next page
    select: cardSelect,
  });
}

/** US-16. Runs on the transaction client of the service (ADR-0007). */
export const insertTask = (tx: Prisma.TransactionClient, data: Prisma.TaskUncheckedCreateInput) => tx.task.create({ data });

/** US-22. The card of a task for its executor: the feed fields plus the status and the time of assignment. */
const workSelect = { ...cardSelect, status: true, assignedAt: true } satisfies Prisma.TaskSelect;

/** US-22 sc.1. One task as its executor may open it, in any state (it has left the feed once assigned). Anyone else gets nothing. */
export const findTaskOfExecutor = (id: string, executorId: string) => prisma.task.findFirst({ where: { id, executorId }, select: workSelect });

/** US-22 sc.1. «Мої активні завдання»: the tasks of this executor, last assigned first, capped (OQ-29). */
export const listTasksOfExecutor = (executorId: string, limit: number) =>
  prisma.task.findMany({ where: { executorId }, orderBy: [{ assignedAt: 'desc' }, { id: 'desc' }], take: limit, select: workSelect });

/** US-22 sc.2. The owner's row, to tell "not found" from "not yours" and to explain a refusal. */
export const findTaskForDelete = (id: string) =>
  prisma.task.findUnique({ where: { id }, select: { id: true, customerId: true, status: true, executorId: true } });

/**
 * US-22 sc.2 (INV-13, ADR-0007). A conditional update: it cancels only an own task with no executor in a cancellable
 * state. `count` 0 means the task changed or never qualified, and the caller answers 409.
 */
export const cancelTaskWithoutExecutor = (tx: Prisma.TransactionClient, id: string, customerId: string) =>
  tx.task.updateMany({
    where: { id, customerId, executorId: null, status: { in: [...CANCELLABLE_BY_OWNER] } },
    data: { status: CANCELLED },
  });

export const findTaskState = (tx: Prisma.TransactionClient, id: string) =>
  tx.task.findUnique({ where: { id }, select: { executorId: true } });
