import { z } from 'zod';
import { LIMITS } from '../limits';
import { emailSchema, studentEmailSchema } from './email';

export const displayNameSchema = z
  .string({ required_error: 'VALIDATION_FAILED', invalid_type_error: 'VALIDATION_FAILED' })
  .trim()
  .min(LIMITS.displayName.min, 'VALIDATION_FAILED')
  .max(LIMITS.displayName.max, 'VALIDATION_FAILED');

export const passwordSchema = z
  .string({ required_error: 'VALIDATION_FAILED', invalid_type_error: 'VALIDATION_FAILED' })
  .min(LIMITS.passwordMinLength, 'VALIDATION_FAILED');

/** US-06 (student, university email), US-43 (customer, any email), US-44 (display name). */
export const registerSchema = z.discriminatedUnion(
  'role',
  [
    z.object({
      role: z.literal('student'),
      email: studentEmailSchema,
      displayName: displayNameSchema,
      password: passwordSchema,
    }),
    z.object({
      role: z.literal('customer'),
      email: emailSchema,
      displayName: displayNameSchema,
      password: passwordSchema,
    }),
  ],
  { errorMap: () => ({ message: 'VALIDATION_FAILED' }) },
);
export type RegisterInput = z.infer<typeof registerSchema>;

/** US-45. Deliberately no password rules here: a wrong password is a 401, not a 400. */
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'VALIDATION_FAILED'),
});
export type LoginInput = z.infer<typeof loginSchema>;

/** US-07/S1, S2. The token comes from the emailed link. */
export const confirmEmailSchema = z.object({
  token: z.string({ required_error: 'TOKEN_INVALID', invalid_type_error: 'TOKEN_INVALID' }).trim().min(1, 'TOKEN_INVALID'),
});
export type ConfirmEmailInput = z.infer<typeof confirmEmailSchema>;

/** US-07/S3. Public: the user may not be able to log in before confirming (ADR-0006, api.md). */
export const resendConfirmationSchema = z.object({ email: emailSchema });
export type ResendConfirmationInput = z.infer<typeof resendConfirmationSchema>;
