import type { Prisma } from '@prisma/client';
import { LIMITS } from '@ctoc/shared';
import { prisma } from '../../platform/db';

/** US-23. Runs on the transaction client of the send action (ADR-0007). */
export const insertMessage = (tx: Prisma.TransactionClient, data: Prisma.MessageUncheckedCreateInput) => tx.message.create({ data });

/**
 * Oldest first. Ids are UUIDv7, so they sort by time. With `after`: the messages newer than that id (polling). Without it:
 * the latest page, so a long chat shows its end (OQ-30).
 */
export async function listMessages(taskId: string, after?: string) {
  if (after) {
    return prisma.message.findMany({ where: { taskId, id: { gt: after } }, orderBy: { id: 'asc' }, take: LIMITS.chatPage.max });
  }
  const latest = await prisma.message.findMany({ where: { taskId }, orderBy: { id: 'desc' }, take: LIMITS.chatPage.max });
  return latest.reverse();
}
