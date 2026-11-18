import type { NotificationsQuery } from '@ctoc/shared';
import type { Prisma, User } from '@prisma/client';
import { ApiError } from '../../errors';
import { executorSelectedPayload, resultAcceptedPayload, resultSubmittedPayload } from './domain';
import { assertCanUseNotifications } from './policy';
import { insertNotification, listNotificationsOfUser, markNotificationRead, notificationExistsForUser } from './repo';

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
