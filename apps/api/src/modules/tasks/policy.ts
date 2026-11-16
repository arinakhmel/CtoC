import type { User } from '@prisma/client';
import { assertStudentWithConfirmedEmail } from '../../http/access';
import { ApiError } from '../../errors';
import { isVerifiedStudent } from '../identity/domain';

/** Access "S-" (api.md, decision OQ-19): any student with a confirmed email reads the feed. Only applying needs verification. */
export const assertCanReadFeed = (user: User): void => assertStudentWithConfirmedEmail(user);

/** Access "C (confirmed)" of api.md: a customer with a confirmed email creates tasks. */
export function assertCanCreateTask(user: User): void {
  if (user.role !== 'customer') throw new ApiError('ROLE_FORBIDDEN');
  if (user.emailConfirmedAt === null) throw new ApiError('EMAIL_NOT_CONFIRMED');
}

/** Access "S+" of api.md (US-22): a verified student with a confirmed email lists the tasks they work on. */
export function assertCanListMyWork(user: User): void {
  assertStudentWithConfirmedEmail(user);
  if (!isVerifiedStudent(user)) throw new ApiError('STUDENT_NOT_VERIFIED');
}

/** Access "Own" of api.md (US-22 sc.2): a customer with a confirmed email. That the task is theirs is checked against the row. */
export const assertCanDeleteTask = (user: User): void => assertCanCreateTask(user);

/** US-22 sc.2. 403 NOT_TASK_OWNER for a task that is known to exist but is not the caller's (api.md §1). */
export function assertTaskOwner(task: { customerId: string }, user: User): void {
  if (task.customerId !== user.id) throw new ApiError('NOT_TASK_OWNER');
}
