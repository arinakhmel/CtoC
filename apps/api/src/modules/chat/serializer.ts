import type { Message } from '@prisma/client';

/**
 * api.md §4.3c. No names, ids of the counterpart or emails: `mine` is for the caller and `from` says which side wrote it.
 */
export const serializeMessage = (message: Message, task: { customerId: string }, userId: string) => ({
  id: message.id,
  body: message.body,
  createdAt: message.createdAt.toISOString(),
  mine: message.senderId === userId,
  from: message.senderId === task.customerId ? ('customer' as const) : ('executor' as const),
});
