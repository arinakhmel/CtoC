import type { NotificationsQuery } from '@ctoc/shared';
import type { Prisma, User } from '@prisma/client';
import { ApiError } from '../../errors';
import { applicationReceivedPayload, executorSelectedPayload, resultAcceptedPayload, resultReturnedPayload, resultSubmittedPayload, taskPublishedPayload, taskRejectedPayload, verificationRejectedPayload } from './domain';
import { assertCanUseNotifications } from './policy';
import { insertNotification, listNotificationsOfUser, markNotificationRead, notificationExistsForUser } from './repo';

/**
 * US-39 (A-15). The student is told in the transaction of the decision that the document was approved, so the text is true
 * when it is read: the badge is set by the same transaction (INV-03, INV-23).
 */
export async function notifyVerificationApproved(tx: Prisma.TransactionClient, studentId: string): Promise<void> {
  await insertNotification(tx, { userId: studentId, type: 'verification_approved', payloadJson: JSON.stringify({}) });
}

/** US-39 sc.2. Same rule: on the transaction of the rejection, with the reason, so a rollback leaves no notification. */
export async function notifyVerificationRejected(tx: Prisma.TransactionClient, studentId: string, reason: string): Promise<void> {
  await insertNotification(tx, {
    userId: studentId,
    type: 'verification_rejected',
    payloadJson: JSON.stringify(verificationRejectedPayload(reason)),
  });
}

/**
 * US-21 sc.1. Called by the assign transaction (US-25) with its own `tx`, so the notification is created in the same
 * transaction as the change it reports and nothing is sent before commit (INV-23, ADR-0007). If the transaction rolls
 * back, no notification exists (sc.2). Cross-module callers use this service, not the repo (ADR-0002).
 */
export async function notifyExecutorSelected(
  tx: Prisma.TransactionClient,
  executorId: string,
  task: { id: string; title: string },
): Promise<void> {
  await insertNotification(tx, {
    userId: executorId,
    type: 'executor_selected',
    payloadJson: JSON.stringify(executorSelectedPayload(task)),
  });
}

/**
 * US-47 sc.1, sc.2. Called by the apply transaction (US-18) with its own `tx`, so the owner of the task is told in the same
 * transaction that stores the application (INV-23). A second application of the same student fails on the unique index
 * (INV-09) before this runs, and the rollback leaves nothing, so a rejected application tells no one (sc.2).
 */
export async function notifyApplicationReceived(
  tx: Prisma.TransactionClient,
  ownerId: string,
  task: { id: string; title: string },
): Promise<void> {
  await insertNotification(tx, {
    userId: ownerId,
    type: 'application_received',
    payloadJson: JSON.stringify(applicationReceivedPayload(task)),
  });
}

/**
 * US-28, US-48 sc.1, sc.3. Called by the submit transaction with its own `tx`, so the owner of the task is told in the same
 * transaction that moves the task to review (INV-23). A failed submit, such as one with no files, rolls back and tells no one
 * (US-48 sc.2). Every submitted version creates its own notification, also after a revision (sc.3).
 */
export async function notifyResultSubmitted(
  tx: Prisma.TransactionClient,
  ownerId: string,
  task: { id: string; title: string },
): Promise<void> {
  await insertNotification(tx, {
    userId: ownerId,
    type: 'result_submitted',
    payloadJson: JSON.stringify(resultSubmittedPayload(task)),
  });
}

/**
 * US-30 sc.1, sc.2 (INV-18, INV-23). The student is told that the customer accepted the result. It is only a row on the CALLER's
 * transaction (`tx`): it opens no transaction of its own and changes no task, escrow, balance or ledger, so it commits or rolls
 * back with the accept that calls it. If that transaction fails, no notification exists and the status is as it was (sc.2). The
 * text says «Оплату нараховано», so it must be called only inside the transaction that also credits the payout.
 *
 * Called by `acceptResult` (`POST /api/tasks/:id/accept`, US-31) as the LAST step of its transaction, after the payout, so the text is
 * true when the student reads it. US-30 sc.1 and sc.2 are covered through that real action in `accept-result.test.ts` (OQ-38).
 */
export async function notifyResultAccepted(
  tx: Prisma.TransactionClient,
  executorId: string,
  task: { id: string; title: string },
): Promise<void> {
  await insertNotification(tx, {
    userId: executorId,
    type: 'result_accepted',
    payloadJson: JSON.stringify(resultAcceptedPayload(task)),
  });
}

/**
 * US-33 (INV-23). The student is told that the customer sent the result back for revision. Only a row on the CALLER's transaction
 * (`tx`): it opens no transaction of its own and changes nothing else, so it commits or rolls back with the return that calls it
 * (`returnResult`, US-32). The comment is not in it, the task card shows the comment.
 */
export async function notifyResultReturned(
  tx: Prisma.TransactionClient,
  executorId: string,
  task: { id: string; title: string },
): Promise<void> {
  await insertNotification(tx, {
    userId: executorId,
    type: 'result_returned',
    payloadJson: JSON.stringify(resultReturnedPayload(task)),
  });
}

/** US-40, US-49 sc.1 (INV-23). The customer is told on the transaction that publishes the task, so a rollback leaves no notification. */
export async function notifyTaskPublished(tx: Prisma.TransactionClient, customerId: string, task: { id: string; title: string }): Promise<void> {
  await insertNotification(tx, { userId: customerId, type: 'task_published', payloadJson: JSON.stringify(taskPublishedPayload(task)) });
}

/** US-40/S2, US-49 sc.2. Same rule, with the reason of the moderator. */
export async function notifyTaskRejected(
  tx: Prisma.TransactionClient,
  customerId: string,
  task: { id: string; title: string },
  reason: string,
): Promise<void> {
  await insertNotification(tx, { userId: customerId, type: 'task_rejected', payloadJson: JSON.stringify(taskRejectedPayload(task, reason)) });
}

/**
 * US-21 sc.3. The caller's own notifications. Without `after`, every unread one comes first, however long ago it was
 * created (so many newer read ones cannot push it out), then the newest read ones up to `limit`. With `after`, only the newer rows.
 * Access "A" (api.md): any logged-in user. Only rows of the caller are read.
 */
export function getMyNotifications(user: User, query: NotificationsQuery) {
  assertCanUseNotifications(user);
  return listNotificationsOfUser(user.id, query.limit, query.after);
}

/**
 * US-21 sc.3. Marks the caller's notification as read. Repeating it is a no-op. A notification that is not the
 * caller's, or does not exist, is 404 NOT_FOUND, so another user's ids are not revealed (ADR-0006).
 */
export async function markMyNotificationRead(user: User, id: string): Promise<void> {
  assertCanUseNotifications(user);
  const changed = await markNotificationRead(user.id, id, new Date());
  if (changed.count === 0 && !(await notificationExistsForUser(user.id, id))) throw new ApiError('NOT_FOUND');
}
