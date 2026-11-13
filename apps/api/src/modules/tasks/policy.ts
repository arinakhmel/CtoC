import type { User } from '@prisma/client';
import { assertStudentWithConfirmedEmail } from '../../http/access';
import { ApiError } from '../../errors';

/** Access "S-" (api.md, decision OQ-19): any student with a confirmed email reads the feed. Only applying needs verification. */
export const assertCanReadFeed = (user: User): void => assertStudentWithConfirmedEmail(user);

/** Access "C (confirmed)" of api.md: a customer with a confirmed email creates tasks. */
export function assertCanCreateTask(user: User): void {
  if (user.role !== 'customer') throw new ApiError('ROLE_FORBIDDEN');
  if (user.emailConfirmedAt === null) throw new ApiError('EMAIL_NOT_CONFIRMED');
}
