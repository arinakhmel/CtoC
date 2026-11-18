import { z } from 'zod';
import { LIMITS } from '../limits';

/** US-21: `GET /api/me/notifications?after=<id>&limit=20` (api.md §4.3b). `after` is the id of the newest notification the client already has. */
export const notificationsQuerySchema = z.object({
  after: z.string({ invalid_type_error: 'VALIDATION_FAILED' }).min(1, 'VALIDATION_FAILED').max(64, 'VALIDATION_FAILED').optional(),
  limit: z.coerce
    .number({ invalid_type_error: 'VALIDATION_FAILED' })
    .int('VALIDATION_FAILED')
    .min(1, 'VALIDATION_FAILED')
    .max(LIMITS.notificationsPage.max, 'VALIDATION_FAILED')
    .default(LIMITS.notificationsPage.default),
});
export type NotificationsQuery = z.infer<typeof notificationsQuerySchema>;

/** US-21: the payload stored with an `executor_selected` notification. */
export const executorSelectedPayloadSchema = z.object({
  taskId: z.string().min(1),
  taskTitle: z.string().min(1),
});
export type ExecutorSelectedPayload = z.infer<typeof executorSelectedPayloadSchema>;

/** US-28, US-48: the payload stored with a `result_submitted` notification, which the customer gets. */
export const resultSubmittedPayloadSchema = z.object({
  taskId: z.string().min(1),
  taskTitle: z.string().min(1),
});
export type ResultSubmittedPayload = z.infer<typeof resultSubmittedPayloadSchema>;

/** US-30: the payload stored with a `result_accepted` notification, which the executor (the student) gets. */
export const resultAcceptedPayloadSchema = z.object({
  taskId: z.string().min(1),
  taskTitle: z.string().min(1),
});
export type ResultAcceptedPayload = z.infer<typeof resultAcceptedPayloadSchema>;

/** US-33: the payload stored with a `result_returned` notification, which the executor gets. The comment is not in it: it is shown on the task card. */
export const resultReturnedPayloadSchema = z.object({
  taskId: z.string().min(1),
  taskTitle: z.string().min(1),
});
export type ResultReturnedPayload = z.infer<typeof resultReturnedPayloadSchema>;
