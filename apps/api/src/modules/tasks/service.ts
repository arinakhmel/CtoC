import { isResultEditable, LIMITS, splitPrice, type CreateTaskInput, type FeedQuery, type ModTaskStatus } from '@ctoc/shared';
import type { Prisma, User } from '@prisma/client';
import { ApiError } from '../../errors';
import { notifyTaskPublished, notifyTaskRejected } from '../notifications/service';
import { prisma } from '../../platform/db';
import { acceptRefusal, assignRefusal, chatStateOf, deleteRefusal, newTaskData, resultRefusal, returnRefusal, REVISION, submitRefusal } from './domain';
import { assertCanCreateTask, assertCanDeleteTask, assertCanListMyTasks, assertCanListMyWork, assertCanReadFeed, assertTaskOwner } from './policy';
import {
  assignTaskTx,
  cancelTaskWithoutExecutor,
  completeTaskTx,
  findChatTask,
  findAcceptedTaskFacts,
  findDeliveryTask,
  findFeedCursor,
  findTaskOwnerAndTitle,
  findTaskOwnerView,
  findOpenTask,
  findTaskForDelete,
  findTaskOfExecutor,
  findTaskState,
  findModTaskTx,
  insertTask,
  insertTaskAuditEvent,
  listTasksForModeration,
  publishTaskTx,
  findCommissionBpSetting,
  rejectTaskTx,
  listFeed,
  listTasksOfCustomer,
  listTasksOfExecutor,
  lockChatTask,
  lockDeliveryTask,
  returnTaskTx,
  submitTaskTx,
  lockOpenTask,
  listDoneTasksOfExecutor,
} from './repo';

/**
 * US-13. The details of one task, with the fixed price set by the customer. A task that is not in the feed
 * (pending, rejected, taken, expired) is 404, so its existence is not leaked (US-14 sc.2).
 */
export async function getTask(user: User, id: string) {
  assertCanReadFeed(user);
  const task = await findOpenTask(id, new Date());
  if (!task) throw new ApiError('NOT_FOUND');
  return task;
}

/**
 * US-18. Called by the applications service as the first statement of its transaction. A task that left the feed
 * meanwhile (assigned, unpublished, expired) is 409 TASK_NOT_OPEN.
 *
 * It is a conditional `updateMany` with the `count` checked (ADR-0007 §1). The write takes the SQLite write lock
 * before the insert, so assign (US-25) cannot run between the check and the insert (ADR-0004: one writer at a time).
 * The (task, student) unique index (INV-09) stays the guard for duplicates. On Postgres the same statement takes a row lock.
 * Only the race reaches this: a task that is already out of the feed is 404 NOT_FOUND from `getTask` before the transaction.
 */
export async function assertTaskOpen(tx: Prisma.TransactionClient, id: string): Promise<void> {
  if ((await lockOpenTask(tx, id, new Date())) === 0) throw new ApiError('TASK_NOT_OPEN');
}

/**
 * US-12. A page of the feed. `nextCursor` is the id of the last task of the page, or null on the last page.
 * `query` is already validated by `validateQuery` in the route. The policy is checked again here, so the
 * service is safe on its own.
 */
export async function getFeed(user: User, query: FeedQuery) {
  assertCanReadFeed(user);

  let after: { id: string; publishedAt: Date } | undefined;
  if (query.cursor) {
    const row = await findFeedCursor(query.cursor);
    if (!row?.publishedAt) throw new ApiError('VALIDATION_FAILED', { details: [{ field: 'cursor', code: 'VALIDATION_FAILED' }] });
    after = { id: row.id, publishedAt: row.publishedAt };
  }

  const rows = await listFeed(new Date(), query.limit, after);
  const page = rows.slice(0, query.limit);
  const last = page[page.length - 1];
  return { tasks: page, nextCursor: rows.length > query.limit && last ? last.id : null };
}

/** US-16. `input` is already validated by `validateBody`. The task always starts in `pending_moderation`. */
export async function createTask(user: User, input: CreateTaskInput) {
  assertCanCreateTask(user);
  return prisma.$transaction((tx) => insertTask(tx, newTaskData(input, user.id)));
}

/**
 * US-22 sc.1. The details of a task for a student: the executor of the task reads it in any state, with its status,
 * because an assigned task has left the feed. Everyone else gets the feed rule (INV-06). `getTask` stays feed-only,
 * so applying to a task (US-18) does not change.
 */
export async function getTaskDetails(user: User, id: string) {
  assertCanReadFeed(user);
  const own = await findTaskOfExecutor(id, user.id);
  if (own) return { task: own, asExecutor: true as const };
  const task = await findOpenTask(id, new Date());
  if (!task) throw new ApiError('NOT_FOUND');
  return { task, asExecutor: false as const };
}

/** US-22 sc.1. «Мої активні завдання»: the tasks the caller works on. Only rows of the caller are read. */
export async function getMyWork(user: User) {
  assertCanListMyWork(user);
  return listTasksOfExecutor(user.id, LIMITS.myWorkMax);
}

/**
 * US-35. The done tasks of an executor with their stored price split, for the finance page. The caller (payments) has already
 * checked who may ask, so this takes the executor id of the session and nobody else's.
 */
export const listPaidTasks = (executorId: string) => listDoneTasksOfExecutor(executorId, LIMITS.myWorkMax);

/** US-50 sc.1. «Мої завдання»: every task of the caller in any state, newest first, at most `LIMITS.myTasksMax`. Only the caller's rows. */
export async function getMyTasks(user: User) {
  assertCanListMyTasks(user);
  return listTasksOfCustomer(user.id, LIMITS.myTasksMax);
}

/**
 * US-22 sc.2 (INV-13, A-08). The owner cancels a task that has no executor. Unknown id is 404, someone else's task is
 * 403 NOT_TASK_OWNER, a task with an executor is 409 TASK_HAS_EXECUTOR so the student does not lose the terms, and a task
 * in a state that cannot be cancelled is 409 INVALID_TRANSITION. The change is one conditional update (ADR-0007).
 * `alsoInTransaction` (US-50 sc.3) runs on the same `tx` after the task is cancelled, so what else must change with the cancel
 * (the applications of the task become `rejected`, A-14) commits or rolls back with it. The applications service passes it.
 */
export async function deleteTask(user: User, id: string, alsoInTransaction?: (tx: Prisma.TransactionClient) => Promise<void>): Promise<void> {
  assertCanDeleteTask(user);
  const task = await findTaskForDelete(id);
  if (!task) throw new ApiError('NOT_FOUND');
  assertTaskOwner(task, user);

  await prisma.$transaction(async (tx) => {
    const moved = await cancelTaskWithoutExecutor(tx, id, user.id, new Date());
    if (moved.count === 0) {
      const now = await findTaskState(tx, id);
      throw new ApiError(deleteRefusal(now ?? task));
    }
    await alsoInTransaction?.(tx);
  });
}

/**
 * US-23. What the chat module needs to know about a task: the two people who may chat and whether the chat is open,
 * read-only or not yet open (INV-22). An unknown task is 404. The chat module calls this, not the tasks table (ADR-0002).
 */
export async function getTaskForChat(id: string) {
  const task = await findChatTask(id);
  if (!task) throw new ApiError('NOT_FOUND');
  return { id: task.id, customerId: task.customerId, executorId: task.executorId, chat: chatStateOf(task.status) };
}

/** US-23. First statement of the send transaction: a conditional update that fails with CHAT_CLOSED if the chat closed meanwhile. */
export async function lockTaskForChat(tx: Prisma.TransactionClient, taskId: string, userId: string): Promise<void> {
  if ((await lockChatTask(tx, taskId, userId)) === 0) throw new ApiError('CHAT_CLOSED');
}

/**
 * US-24. A task for its owner's candidate list: its owner, title, status and price. An unknown task is 404; whether the
 * caller owns it is the caller's policy. The applications module calls this, not the tasks table (ADR-0002).
 */
/**
 * US-47. The owner and the title of a task, on the caller's `tx`, for the notification of a new application. Called after
 * `assertTaskOpen` has taken the write lock, so the row exists (a task is never deleted, only cancelled).
 */
export async function getTaskOwnerAndTitle(tx: Prisma.TransactionClient, id: string) {
  return findTaskOwnerAndTitle(tx, id);
}

export async function getTaskOwnerView(id: string) {
  const task = await findTaskOwnerView(id);
  if (!task) throw new ApiError('NOT_FOUND');
  return task;
}

/**
 * US-25. The task side of selecting an executor, on the caller's `tx` (ADR-0002 rule 1): one conditional update. 409
 * TASK_ALREADY_ASSIGNED if an executor is already chosen, 409 TASK_NOT_OPEN if the task is not published, is past its deadline, or its
 * price is no longer the one the escrow will take.
 */
export async function assignTask(
  tx: Prisma.TransactionClient,
  taskId: string,
  ownerId: string,
  executorId: string,
  priceKopecks: number,
): Promise<void> {
  const moved = await assignTaskTx(tx, taskId, ownerId, executorId, priceKopecks, new Date());
  if (moved.count === 0) {
    const state = await findTaskState(tx, taskId);
    throw new ApiError(assignRefusal(state ?? { executorId: null }));
  }
}

/**
 * US-27. What the delivery module needs to know about a task: the two people on it and why result files cannot be added now (null when they can).
 * An unknown task is 404. Whether the caller is the executor is the caller's policy. The delivery module calls this, not the
 * tasks table (ADR-0002).
 */
export async function getTaskForDelivery(id: string) {
  const task = await findDeliveryTask(id);
  if (!task) throw new ApiError('NOT_FOUND');
  return {
    id: task.id,
    customerId: task.customerId,
    executorId: task.executorId,
    title: task.title,
    // True while the task is in revision: then the delivery module also gives the comment of the last return (US-33).
    inRevision: task.status === REVISION,
    // Why files cannot be added now, or null when they can. The delivery module throws it as it is (ADR-0002: no import of this domain).
    refusal: isResultEditable(task.status) ? null : resultRefusal(task.status),
  };
}

/** US-27. First statement of the upload transaction: a conditional update that refuses if the task no longer accepts files. */
export async function lockTaskForDelivery(tx: Prisma.TransactionClient, taskId: string, executorId: string): Promise<void> {
  if ((await lockDeliveryTask(tx, taskId, executorId)) > 0) return;
  const now = await tx.task.findUnique({ where: { id: taskId }, select: { status: true } });
  throw new ApiError(resultRefusal(now?.status ?? 'cancelled'));
}

/**
 * US-28 sc.1, sc.3 (INV-15). First statement of the submit transaction: the conditional update that moves the executor's task to
 * `in_review`. It is the write lock and the transition in one (OQ-35 i). Zero rows means the task is already under review
 * (409 ALREADY_IN_REVIEW) or in a state that has no result to submit (409 INVALID_TRANSITION). The delivery module calls this,
 * not the tasks table (ADR-0002).
 */
export async function moveTaskToReview(tx: Prisma.TransactionClient, taskId: string, executorId: string): Promise<void> {
  if ((await submitTaskTx(tx, taskId, executorId)).count > 0) return;
  const now = await tx.task.findUnique({ where: { id: taskId }, select: { status: true } });
  throw new ApiError(submitRefusal(now?.status ?? 'cancelled'));
}

/**
 * US-31 sc.1, sc.3 (INV-18). First statement of the accept transaction: the conditional update that closes the owner's task,
 * `in_review` -> `done`, with the time. Zero rows means the deal is already closed (409 TASK_ALREADY_DONE) or the task has
 * no result under review (409 TASK_NOT_IN_REVIEW). It is the write lock and the transition in one. Returns what the rest of the
 * accept needs, read after the write in the same transaction. The delivery module calls this, not the tasks table (ADR-0002).
 */
export async function moveTaskToDone(tx: Prisma.TransactionClient, taskId: string, ownerId: string, now: Date) {
  if ((await completeTaskTx(tx, taskId, ownerId, now)).count === 0) {
    const current = await tx.task.findUnique({ where: { id: taskId }, select: { status: true } });
    throw new ApiError(acceptRefusal(current?.status ?? 'cancelled'));
  }
  return findAcceptedTaskFacts(tx, taskId);
}

/**
 * US-32 sc.1, sc.2 (INV-17). First statement of the return transaction: the conditional update that sends the owner's task back,
 * `in_review` -> `revision`. Zero rows means the deal is already closed (409 TASK_ALREADY_DONE) or the task has no result under
 * review (409 TASK_NOT_IN_REVIEW). It is the write lock and the transition in one, so a return and an accept at the same time
 * cannot both win. The delivery module calls this, not the tasks table (ADR-0002).
 */
export async function moveTaskToRevision(tx: Prisma.TransactionClient, taskId: string, ownerId: string): Promise<typeof REVISION> {
  if ((await returnTaskTx(tx, taskId, ownerId)).count > 0) return REVISION;
  const current = await tx.task.findUnique({ where: { id: taskId }, select: { status: true } });
  throw new ApiError(returnRefusal(current?.status ?? 'cancelled'));
}

/** US-40. The queue of the moderator. The role is checked by the admin module (INV-25). */
export const listModerationQueue = (status: ModTaskStatus) => listTasksForModeration(status);

/**
 * US-40, INV-08. The rate in force: the setting, or `LIMITS.commissionBp.default` when there is no row yet (US-03 is not built). The database
 * constrains only the key, so a stored value is checked here against the documented range (an integer in 0..5000). A bad value is never
 * written into a snapshot (it could give a negative net): 500 `INTERNAL_ERROR`, logged, the publish rolled back, as OQ-39 (a).
 */
async function commissionBpInForce(tx: Prisma.TransactionClient): Promise<number> {
  const stored = await findCommissionBpSetting(tx);
  if (stored === null) return LIMITS.commissionBp.default;
  if (!Number.isInteger(stored) || stored < LIMITS.commissionBp.min || stored > LIMITS.commissionBp.max) {
    console.error(`Setting commission_bp is ${stored}, outside ${LIMITS.commissionBp.min}..${LIMITS.commissionBp.max}: the task cannot be published`);
    throw new ApiError('INTERNAL_ERROR');
  }
  return stored;
}

/**
 * US-40 sc.1, INV-05, INV-08, INV-24. One transaction: the rate in force (the setting, or the default), the split with `splitPrice`,
 * then ONE conditional write `pending_moderation` → `published` with the snapshot (commission, net, rate) and `publishedAt`. A count of 0
 * is a repeat, a race, or a task the owner already cancelled: 409 `ALREADY_DECIDED`, an unknown id is 404. The audit event and the
 * notification to the customer are in the same transaction, so «опубліковано» is true when it is read.
 */
export async function publishTask(moderatorId: string, id: string) {
  return prisma.$transaction(async (tx) => {
    const task = await findModTaskTx(tx, id);
    if (!task) throw new ApiError('NOT_FOUND');
    const commissionBp = await commissionBpInForce(tx);
    const split = splitPrice(task.priceKopecks, commissionBp);
    const changed = await publishTaskTx(tx, id, { commissionBp, commissionKopecks: split.commissionKopecks, netKopecks: split.netKopecks }, new Date());
    if (changed.count === 0) throw new ApiError('ALREADY_DECIDED');
    await insertTaskAuditEvent(tx, { actorId: moderatorId, action: 'task.published', entityId: id, data: { commissionBp, ...split } });
    await notifyTaskPublished(tx, task.customerId, { id, title: task.title });
    return (await findModTaskTx(tx, id))!;
  });
}

/** US-40 sc.2, US-49 sc.2. The same transaction shape: `pending_moderation` → `rejected` with the reason, an audit event, the notification with the reason. */
export async function rejectTask(moderatorId: string, id: string, reason: string) {
  return prisma.$transaction(async (tx) => {
    const task = await findModTaskTx(tx, id);
    if (!task) throw new ApiError('NOT_FOUND');
    const changed = await rejectTaskTx(tx, id, reason);
    if (changed.count === 0) throw new ApiError('ALREADY_DECIDED');
    await insertTaskAuditEvent(tx, { actorId: moderatorId, action: 'task.rejected', entityId: id, data: { reason } });
    await notifyTaskRejected(tx, task.customerId, { id, title: task.title }, reason);
    return (await findModTaskTx(tx, id))!;
  });
}
