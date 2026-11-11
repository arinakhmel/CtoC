import type { User } from '@prisma/client';
import { ApiError } from '../errors';

/**
 * Access code "S-" of api.md: a student whose email is confirmed (INV-02). One implementation for every
 * module's policy.ts, so the rule is written once. 403 ROLE_FORBIDDEN or 403 EMAIL_NOT_CONFIRMED.
 */
export function assertStudentWithConfirmedEmail(user: User): void {
  if (user.role !== 'student') throw new ApiError('ROLE_FORBIDDEN');
  if (user.emailConfirmedAt === null) throw new ApiError('EMAIL_NOT_CONFIRMED');
}
