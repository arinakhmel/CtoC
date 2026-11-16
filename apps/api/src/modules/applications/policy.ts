import type { User } from '@prisma/client';
import { ApiError } from '../../errors';
import { assertStudentWithConfirmedEmail } from '../../http/access';
import { isVerifiedStudent } from '../identity/domain';

/**
 * Access "S+" of api.md (INV-02, US-18 sc.3): a student with a confirmed email who is verified by a moderator.
 * An unverified student gets 403 STUDENT_NOT_VERIFIED, and the UI links to /me/verification.
 */
/** Access "S-" of api.md (US-20): any student with a confirmed email may read their own applications. Verification is not needed to look. */
export const assertCanReadMyApplications = (user: User): void => assertStudentWithConfirmedEmail(user);

export function assertCanApply(user: User): void {
  assertStudentWithConfirmedEmail(user);
  if (!isVerifiedStudent(user)) throw new ApiError('STUDENT_NOT_VERIFIED');
}

/** Access "Own" of api.md (US-24): a customer with a confirmed email. That the task is theirs is checked against the row. */
export function assertCanListCandidates(user: User): void {
  if (user.role !== 'customer') throw new ApiError('ROLE_FORBIDDEN');
  if (user.emailConfirmedAt === null) throw new ApiError('EMAIL_NOT_CONFIRMED');
}

/**
 * US-24. 403 NOT_TASK_OWNER for a task that exists but is not the caller's (api.md §1). The same one-line rule is in the tasks
 * policy (`assertTaskOwner`): a policy of another module is not imported (ADR-0002 rule 4). The copies are listed in OQ-31.
 */
export function assertOwnsTask(task: { customerId: string }, user: User): void {
  if (task.customerId !== user.id) throw new ApiError('NOT_TASK_OWNER');
}

/** Access "Own" of api.md (US-25): a customer with a confirmed email. That the task is theirs is checked against the row. */
export const assertCanAssign = (user: User): void => assertCanListCandidates(user);
