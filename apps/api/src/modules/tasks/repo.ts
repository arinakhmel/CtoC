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
    select: { id: true, title: true, description: true, priceKopecks: true, deadlineAt: true, publishedAt: true },
  });
}
