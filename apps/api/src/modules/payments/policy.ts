import type { User } from '@prisma/client';
import { ApiError } from '../../errors';
import { assertStudentWithConfirmedEmail } from '../../http/access';
import { isVerifiedStudent } from '../identity/domain';

/** Access "C" of api.md (US-26): a customer with a confirmed email tops up their own balance. */
export function assertCanTopUp(user: User): void {
  if (user.role !== 'customer') throw new ApiError('ROLE_FORBIDDEN');
  if (user.emailConfirmedAt === null) throw new ApiError('EMAIL_NOT_CONFIRMED');
}

/** Access "S+ · C" of api.md (US-26, US-34): a customer with a confirmed email, or a verified student. Everyone reads only their own balance. */
export function assertCanReadBalance(user: User): void {
  if (user.role === 'customer') {
    assertCanTopUp(user);
    return;
  }
  assertStudentWithConfirmedEmail(user);
  if (!isVerifiedStudent(user)) throw new ApiError('STUDENT_NOT_VERIFIED');
}

/**
 * Access "S+" of api.md §4.1b (US-35, US-34): a verified student with a confirmed email, nobody else. A customer is 403
 * ROLE_FORBIDDEN here, although `GET /api/me/balance` lets a customer read their own balance.
 */
export function assertCanReadFinance(user: User): void {
  assertStudentWithConfirmedEmail(user);
  if (!isVerifiedStudent(user)) throw new ApiError('STUDENT_NOT_VERIFIED');
}

/** Access "S+" of api.md §4.1c (US-36, INV-02): only a verified student with a confirmed email withdraws and lists withdrawals. */
export function assertCanWithdraw(user: User): void {
  assertStudentWithConfirmedEmail(user);
  if (!isVerifiedStudent(user)) throw new ApiError('STUDENT_NOT_VERIFIED');
}
