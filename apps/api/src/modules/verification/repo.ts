import type { Prisma } from '@prisma/client';
import { prisma } from '../../platform/db';

type Tx = Prisma.TransactionClient;

/**
 * Zero rows means the user is already a verified student (or has no confirmed email). The update changes
 * nothing, it only makes the check atomic with the inserts that follow (ADR-0007).
 */
export const guardNotVerified = (tx: Tx, userId: string) =>
  tx.user.updateMany({
    where: { id: userId, role: 'student', emailConfirmedAt: { not: null }, studentVerifiedAt: null },
    data: { role: 'student' }, // same value: a no-op write that only reports whether the row still qualifies
  });

export const insertDocumentFile = (
  tx: Tx,
  data: { ownerId: string; storageKey: string; originalName: string; mime: string; sizeBytes: number; sha256: string },
) => tx.file.create({ data: { ...data, kind: 'student_document' } });

export const insertPendingRequest = (tx: Tx, data: { userId: string; fileId: string }) =>
  tx.verificationRequest.create({ data: { ...data, status: 'pending' } });

export const findLatestRequest = (userId: string) =>
  prisma.verificationRequest.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } });
