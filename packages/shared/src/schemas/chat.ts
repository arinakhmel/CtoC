import { z } from 'zod';

import { LIMITS } from '../limits';

/**
 * US-23: `POST /api/tasks/:id/messages`. The body is trimmed, so a line of spaces is empty (sc.2). Unknown keys (a forged
 * sender, task or time) are stripped: the sender is the session, the task is the URL.
 */
export const createMessageSchema = z.object({
  body: z
    .string({ required_error: 'MESSAGE_EMPTY', invalid_type_error: 'VALIDATION_FAILED' })
    .trim()
    .min(1, 'MESSAGE_EMPTY')
    .max(LIMITS.messageMax, 'MESSAGE_TOO_LONG'),
});
export type CreateMessageInput = z.infer<typeof createMessageSchema>;

/** US-23: `GET /api/tasks/:id/messages?after=<id>` (api.md §4.3c). `after` is the id of the newest message the client has. */
export const chatQuerySchema = z.object({
  after: z.string({ invalid_type_error: 'VALIDATION_FAILED' }).min(1, 'VALIDATION_FAILED').max(64, 'VALIDATION_FAILED').optional(),
});
export type ChatQuery = z.infer<typeof chatQuerySchema>;
