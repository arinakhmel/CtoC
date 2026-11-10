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
