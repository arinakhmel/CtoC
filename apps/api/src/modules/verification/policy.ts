import type { User } from '@prisma/client';
import { ApiError } from '../../errors';

/** INV-02: only a student with a confirmed email can submit a document or see its status (api.md access S-). */
export function assertStudentWithConfirmedEmail(user: User): void {
  if (user.role !== 'student') throw new ApiError('ROLE_FORBIDDEN');
  if (user.emailConfirmedAt === null) throw new ApiError('EMAIL_NOT_CONFIRMED');
}
