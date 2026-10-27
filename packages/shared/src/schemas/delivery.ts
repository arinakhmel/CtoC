import { z } from 'zod';
import { LIMITS } from '../limits';

/** US-32/S3, US-33: returning a result for revision needs a comment. */
export const returnForRevisionSchema = z.object({
  comment: z
    .string({ required_error: 'COMMENT_REQUIRED', invalid_type_error: 'VALIDATION_FAILED' })
    .trim()
    .min(1, 'COMMENT_REQUIRED')
    .max(LIMITS.revisionCommentMax, 'COMMENT_TOO_LONG'),
});

/** US-23/S2: chat messages cannot be empty. */
export const sendMessageSchema = z.object({
  body: z
    .string({ required_error: 'MESSAGE_EMPTY', invalid_type_error: 'VALIDATION_FAILED' })
    .trim()
    .min(1, 'MESSAGE_EMPTY')
    .max(LIMITS.messageMax, 'MESSAGE_TOO_LONG'),
});
