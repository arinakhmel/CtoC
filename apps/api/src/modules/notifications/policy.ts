import type { User } from '@prisma/client';

/**
 * Access "A" of api.md (US-21): any logged-in user may read and mark their own notifications. `requireUser` has already
 * checked the session; there is no role or resource rule here. What the user may touch is limited by the repo, which only
 * reads and writes rows of `user.id` (a foreign id is 404, ADR-0006). This is the one place to tighten if that changes.
 */
export const assertCanUseNotifications = (_user: User): void => {};
