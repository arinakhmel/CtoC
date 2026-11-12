import type { Prisma } from '@prisma/client';
import { prisma } from '../../platform/db';

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
