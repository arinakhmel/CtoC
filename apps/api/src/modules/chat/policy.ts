import type { User } from '@prisma/client';
import { ApiError } from '../../errors';

/** Access "Own · Ex" of api.md (INV-22, US-23 sc.3): only the customer who owns the task and its executor take part in the chat. */
export function assertChatParticipant(task: { customerId: string; executorId: string | null }, user: User): void {
  if (user.id !== task.customerId && user.id !== task.executorId) throw new ApiError('NOT_CHAT_PARTICIPANT');
}
