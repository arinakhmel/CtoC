import type { User } from '@prisma/client';
import { isVerifiedStudent } from './domain';

/** api.md: the 201 body of POST /api/auth/register. The email and the hash are never returned. */
export const serializeRegistered = (user: User) => ({
  user: {
    id: user.id,
    role: user.role,
    displayName: user.displayName,
    emailConfirmed: user.emailConfirmedAt !== null,
  },
});

/** api.md §4.6: the 200 body of POST /api/auth/confirm-email. */
export const serializeConfirmed = (user: User) => ({
  user: { id: user.id, role: user.role, displayName: user.displayName, emailConfirmed: user.emailConfirmedAt !== null },
});

/** api.md §4.7: the user in the login and `GET /api/me` bodies. The email and the hash are never returned. */
export const serializeMe = (user: User) => ({
  user: {
    id: user.id,
    role: user.role,
    displayName: user.displayName,
    emailConfirmed: user.emailConfirmedAt !== null,
    studentVerified: user.studentVerifiedAt !== null,
  },
});

/** api.md §4.9: the public profile. Never the email, the role or the hash. Bio and experience come with US-11, 37, 38. */
export const serializePublicProfile = (user: User, skills: string[]) => ({
  profile: { id: user.id, displayName: user.displayName, verified: isVerifiedStudent(user), skills },
});
