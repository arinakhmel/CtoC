import type { User } from '@prisma/client';
import { ApiError } from '../../errors';

/** INV-25 (api.md, Moderation and admin): only moderators reach `/api/mod/*`. Anyone else with a session is 403 ROLE_FORBIDDEN. */
export function assertModerator(user: User): void {
  if (user.role !== 'moderator') throw new ApiError('ROLE_FORBIDDEN');
}
