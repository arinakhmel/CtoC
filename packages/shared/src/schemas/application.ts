import { z } from 'zod';
import { LIMITS } from '../limits';

/**
 * US-18, US-19, US-42. There is no price field: a forged `priceKopecks` in the body is
 * stripped by the parser, so the application always carries the customer's fixed price.
 */
export const createApplicationSchema = z.object({
  note: z
    .string({ invalid_type_error: 'VALIDATION_FAILED' })
    .trim()
    .max(LIMITS.applicationNoteMax, 'NOTE_TOO_LONG')
    .optional()
    .transform((note) => (note ? note : undefined)),
});
export type CreateApplicationInput = z.infer<typeof createApplicationSchema>;

/** US-25: the customer picks one application. */
export const assignExecutorSchema = z.object({
  applicationId: z.string({ required_error: 'VALIDATION_FAILED' }).min(1, 'VALIDATION_FAILED'),
});

/**
 * US-26: the `Idempotency-Key` header of `POST /api/tasks/:id/assign`. A value the client makes once per attempt (a UUID),
 * so a double click or a retry returns the same result and charges once. 8 to 100 characters.
 */
export const idempotencyKeySchema = z
  .string({ invalid_type_error: 'VALIDATION_FAILED' })
  .trim()
  .min(8, 'VALIDATION_FAILED')
  .max(100, 'VALIDATION_FAILED');
export type AssignExecutorInput = z.infer<typeof assignExecutorSchema>;
