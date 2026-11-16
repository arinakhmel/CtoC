import type { ChatQuery, CreateMessageInput } from '@ctoc/shared';
import type { User } from '@prisma/client';
import { ApiError } from '../../errors';
import { prisma } from '../../platform/db';
import { getTaskForChat, lockTaskForChat } from '../tasks/service';
import { assertChatParticipant } from './policy';
import { insertMessage, listMessages } from './repo';

export type ChatTask = Awaited<ReturnType<typeof getTaskForChat>>;

/**
 * US-23 sc.3. The task of a chat for a caller: an unknown task is 404, a caller who is neither the owner nor the executor
 * is 403 NOT_CHAT_PARTICIPANT. The routes run this first, so access is checked before the body or query (ADR-0006).
 */
export async function resolveChat(user: User, taskId: string): Promise<ChatTask> {
  const task = await getTaskForChat(taskId);
  assertChatParticipant(task, user);
  return task;
}

/** US-23 sc.1. The messages of the chat, oldest first. Before assignment there is no chat yet, so the list is empty (OQ-30). */
export async function getMessages(task: ChatTask, query: ChatQuery) {
  return task.chat === 'notopen' ? [] : listMessages(task.id, query.after);
}

/**
 * US-23 sc.1, sc.2 (INV-22). `input` is already validated by `validateBody`. The chat must be open (409 CHAT_CLOSED
 * before assignment, and after done or cancelled). One transaction: a conditional update that proves the sender is a
 * participant and the chat is still open, then the insert, so no message is written after the chat closes (ADR-0007).
 */
export async function sendMessage(user: User, task: ChatTask, input: CreateMessageInput) {
  // A fast path only, from the state read by `resolveChat`. The decision is the conditional update in `lockTaskForChat` below,
  // whose row count is checked inside the transaction: the chat may have closed since the read (ADR-0007).
  if (task.chat !== 'open') throw new ApiError('CHAT_CLOSED');
  return prisma.$transaction(async (tx) => {
    await lockTaskForChat(tx, task.id, user.id);
    return insertMessage(tx, { taskId: task.id, senderId: user.id, body: input.body });
  });
}
