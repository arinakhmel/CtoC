import type { Prisma } from '@prisma/client';
import { LIMITS } from '@ctoc/shared';
import { prisma } from '../../platform/db';

/** US-21. Runs on the transaction client of the business action, so the notification commits or rolls back with it (INV-23). */
export const insertNotification = (tx: Prisma.TransactionClient, data: Prisma.NotificationUncheckedCreateInput) =>
  tx.notification.create({ data });

/**
 * Ids are UUIDv7, so they sort by time. With `after`: only the rows newer than that id, newest first (polling).
 * Without it: every unread row first (up to the unread cap, newest first), then the newest read rows up to `limit`.
 * An old unread notification is therefore always listed (US-21 sc.3), however many newer read ones exist.
 */
export async function listNotificationsOfUser(userId: string, limit: number, after?: string) {
  if (after) {
    return prisma.notification.findMany({ where: { userId, id: { gt: after } }, orderBy: { id: 'desc' }, take: limit });
  }
  const unread = await prisma.notification.findMany({
    where: { userId, readAt: null },
    orderBy: { id: 'desc' },
    take: LIMITS.notificationsPage.unreadMax,
  });
  const read = await prisma.notification.findMany({
    where: { userId, readAt: { not: null } },
    orderBy: { id: 'desc' },
    take: limit,
  });
  return [...unread, ...read];
}

/** A conditional update: only the recipient's unread row changes (ADR-0007). `count` 0 means it was already read or is not theirs. */
export const markNotificationRead = (userId: string, id: string, now: Date) =>
  prisma.notification.updateMany({ where: { id, userId, readAt: null }, data: { readAt: now } });

export const notificationExistsForUser = async (userId: string, id: string): Promise<boolean> =>
  (await prisma.notification.count({ where: { id, userId } })) > 0;
