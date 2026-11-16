import type { User } from '@prisma/client';
import { ApiError } from '../../errors';
import { assertStudentWithConfirmedEmail } from '../../http/access';
import { isVerifiedStudent } from '../identity/domain';

/**
 * Access "S+" of api.md (INV-02, US-18 sc.3): a student with a confirmed email who is verified by a moderator.
 * An unverified student gets 403 STUDENT_NOT_VERIFIED, and the UI links to /me/verification.
 */
export function assertCanApply(user: User): void {
  assertStudentWithConfirmedEmail(user);
  if (!isVerifiedStudent(user)) throw new ApiError('STUDENT_NOT_VERIFIED');
}
