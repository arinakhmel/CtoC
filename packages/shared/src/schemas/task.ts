import { z } from 'zod';
import { LIMITS } from '../limits';

/**
 * US-16, US-17. There is no `status` field: unknown keys are stripped, so a client cannot
 * publish a task directly (US-40/S3). The status is always `pending_moderation` on creation.
 */
export const createTaskSchema = z.object({
  title: z
    .string({ required_error: 'TITLE_TOO_SHORT', invalid_type_error: 'VALIDATION_FAILED' })
    .trim()
    .min(LIMITS.title.min, 'TITLE_TOO_SHORT')
    .max(LIMITS.title.max, 'VALIDATION_FAILED'),
  description: z
    .string({ required_error: 'VALIDATION_FAILED', invalid_type_error: 'VALIDATION_FAILED' })
    .trim()
    .min(LIMITS.description.min, 'VALIDATION_FAILED')
    .max(LIMITS.description.max, 'VALIDATION_FAILED'),
  priceKopecks: z
    .number({ required_error: 'VALIDATION_FAILED', invalid_type_error: 'VALIDATION_FAILED' })
    .int('VALIDATION_FAILED')
    .min(LIMITS.priceKopecks.min, 'PRICE_BELOW_MIN')
    .max(LIMITS.priceKopecks.max, 'PRICE_ABOVE_MAX'),
  deadlineAt: z
    .string({ required_error: 'VALIDATION_FAILED', invalid_type_error: 'VALIDATION_FAILED' })
    .datetime({ message: 'VALIDATION_FAILED' })
    .refine((value) => Date.parse(value) > Date.now(), { message: 'DEADLINE_IN_PAST' }),
});
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

/** US-39/S2, US-40/S2: a moderator's rejection needs a reason. */
export const moderationRejectSchema = z.object({
  reason: z
    .string({ required_error: 'REASON_REQUIRED', invalid_type_error: 'VALIDATION_FAILED' })
    .trim()
    .min(1, 'REASON_REQUIRED')
    .max(LIMITS.moderationReasonMax, 'VALIDATION_FAILED'),
});
