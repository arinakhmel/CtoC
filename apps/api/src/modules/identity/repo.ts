import type { Prisma } from '@prisma/client';
import { prisma } from '../../platform/db';

export type Tx = Prisma.TransactionClient;

export const isUniversityDomainListed = async (domain: string): Promise<boolean> =>
  (await prisma.universityDomain.findUnique({ where: { domain } })) !== null;

export const insertUser = (
  tx: Tx,
  data: { email: string; passwordHash: string; displayName: string; role: 'student' | 'customer' },
) => tx.user.create({ data });

export const insertConfirmToken = (tx: Tx, data: { userId: string; tokenHash: string; expiresAt: Date }) =>
  tx.emailToken.create({ data: { ...data, purpose: 'confirm_email' } });

export const findUserByEmail = (email: string) => prisma.user.findUnique({ where: { email } });

export const findTokenByHash = (tx: Tx, tokenHash: string) => tx.emailToken.findUnique({ where: { tokenHash } });

/** Single use: only an unused, unexpired token can be consumed. Zero rows means it cannot. */
export const consumeToken = (tx: Tx, id: string, now: Date) =>
  tx.emailToken.updateMany({ where: { id, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } });

export const confirmUser = (tx: Tx, userId: string, now: Date) =>
  tx.user.updateMany({ where: { id: userId, emailConfirmedAt: null }, data: { emailConfirmedAt: now } });

/** A resend invalidates older unused confirmation tokens of the user (domain-model.md, [prop]). */
export const invalidateUnusedConfirmTokens = (tx: Tx, userId: string, now: Date) =>
  tx.emailToken.updateMany({ where: { userId, purpose: 'confirm_email', usedAt: null }, data: { usedAt: now } });

export const findUserById = (tx: Tx, id: string) => tx.user.findUniqueOrThrow({ where: { id } });

export const insertSession = (data: { id: string; userId: string; expiresAt: Date }) => prisma.session.create({ data });

/** A session is valid only while `expiresAt > now`. */
export const findValidSession = (idHash: string, now: Date) =>
  prisma.session.findFirst({ where: { id: idHash, expiresAt: { gt: now } }, include: { user: true } });

export const deleteExpiredSessions = (now: Date) => prisma.session.deleteMany({ where: { expiresAt: { lte: now } } });

/** Only student accounts have a public profile (A-16). Anything else is the same as a missing account. */
export const findStudentById = (id: string) => prisma.user.findFirst({ where: { id, role: 'student' } });

/**
 * Case-insensitive for ASCII (SQLite NOCASE, the same collation as the unique index). Cyrillic letters in
 * different case may become two skill rows, which only adds noise to the suggestions.
 */
export const findSkillByName = async (tx: Tx, name: string) => {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM skills WHERE name = ${name} COLLATE NOCASE LIMIT 1`;
  return rows[0] ?? null;
};

export const insertSkill = (tx: Tx, name: string) => tx.skill.create({ data: { name, inCatalog: false } });

/** Replaces the whole set of a profile. The primary key (user_id, skill_id) prevents duplicates. */
export const replaceProfileSkills = async (tx: Tx, userId: string, skillIds: string[]) => {
  await tx.profileSkill.deleteMany({ where: { userId } });
  await tx.profileSkill.createMany({ data: skillIds.map((skillId) => ({ userId, skillId })) });
};

export const listCatalogSkillNames = async () =>
  (await prisma.skill.findMany({ where: { inCatalog: true }, select: { name: true } })).map((skill) => skill.name);

export const listSkillNames = async (userId: string) =>
  (await prisma.profileSkill.findMany({ where: { userId }, include: { skill: true } })).map((row) => row.skill.name);

/** One atomic statement: creates the profile row on the first save, updates it afterwards (US-11). */
export const upsertBio = (userId: string, bio: string) =>
  prisma.studentProfile.upsert({ where: { userId }, create: { userId, bio }, update: { bio } });

export const findBio = async (userId: string): Promise<string> =>
  (await prisma.studentProfile.findUnique({ where: { userId }, select: { bio: true } }))?.bio ?? '';
