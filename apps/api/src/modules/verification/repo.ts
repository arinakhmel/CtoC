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

/**
 * A moderator decision on the user's pending request (INV-04: at most one). Zero rows means it was already
 * decided (a second click) or there is nothing to decide. `decidedBy` stays empty: a Telegram moderator has no account.
 */
export const decidePending = (tx: Tx, userId: string, status: 'approved' | 'rejected', reason: string | null, now: Date) =>
  tx.verificationRequest.updateMany({
    where: { userId, status: 'pending' },
    data: { status, reason, decidedAt: now },
  });

/** INV-03: the badge. Only a student who is not yet verified qualifies. */
export const markStudentVerified = (tx: Tx, userId: string, now: Date) =>
  tx.user.updateMany({ where: { id: userId, role: 'student', studentVerifiedAt: null }, data: { studentVerifiedAt: now } });

export const findUserEmail = (tx: Tx, userId: string) => tx.user.findUnique({ where: { id: userId }, select: { email: true } });

export const insertAuditEvent = (tx: Tx, data: { action: string; entityId: string; data: Record<string, unknown> }) =>
  tx.auditEvent.create({ data: { action: data.action, entity: 'user', entityId: data.entityId, dataJson: JSON.stringify(data.data) } });
