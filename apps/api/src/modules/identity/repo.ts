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
