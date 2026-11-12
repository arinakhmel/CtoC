import type { User } from '@prisma/client';
import { assertStudentWithConfirmedEmail } from '../../http/access';

/** Access "S-" (api.md, decision OQ-19): any student with a confirmed email reads the feed. Only applying needs verification. */
export const assertCanReadFeed = (user: User): void => assertStudentWithConfirmedEmail(user);
