import type { Notification } from '@prisma/client';
import { notificationText, parsePayload } from './domain';

/** api.md §4.3b. `read` is a boolean; the timestamps are ISO strings. */
export function serializeNotification(notification: Notification) {
  const payload = parsePayload(notification.payloadJson);
  return {
    id: notification.id,
    type: notification.type,
    text: notificationText(notification.type, payload),
    payload,
    read: notification.readAt !== null,
    createdAt: notification.createdAt.toISOString(),
  };
}
