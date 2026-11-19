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

/** api.md §4.9: the public profile. Never the email, the role or the hash. */
export const serializeProfileCard = (user: User, skills: string[], bio: string) => ({
  id: user.id,
  displayName: user.displayName,
  verified: isVerifiedStudent(user),
  skills,
  bio,
});

/** US-37, US-38: one experience record as the public profile shows it. Always confirmed by the platform: nobody else writes one. */
export interface ExperienceRow {
  id: string;
  title: string;
  description: string;
  completedAt: Date;
}

/** api.md §4.9: the public profile with the experience records (US-37, US-38). The amounts of the task are never in it. */
export const serializePublicProfile = (user: User, skills: string[], bio: string, experience: ExperienceRow[]) => ({
  profile: {
    ...serializeProfileCard(user, skills, bio),
    experience: experience.map((record) => ({
      id: record.id,
      title: record.title,
      description: record.description,
      completedAt: record.completedAt.toISOString(),
      confirmedBy: 'platform' as const,
    })),
  },
});
