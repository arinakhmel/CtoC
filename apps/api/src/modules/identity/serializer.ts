import type { User } from '@prisma/client';

/** api.md: the 201 body of POST /api/auth/register. The email and the hash are never returned. */
export const serializeRegistered = (user: User) => ({
  user: {
    id: user.id,
    role: user.role,
    displayName: user.displayName,
    emailConfirmed: user.emailConfirmedAt !== null,
  },
});
