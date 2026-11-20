import type { Prisma } from '@prisma/client';
import { prisma } from '../../platform/db';
import { VERIFICATION_PENDING } from './domain';

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
 * A moderator decision on a pending request (INV-04: at most one per user). Zero rows means it was already decided (a second
 * click) or there is nothing to decide. Both web and Telegram pass `requestId` for the document the moderator saw, so an older
 * button cannot decide a newer pending document of the same student. `decidedBy` stays empty only for Telegram, whose moderator
 * has no account.
 */
export const decidePending = (
  tx: Tx,
  decision: { userId: string; requestId?: string | undefined; status: 'approved' | 'rejected'; reason: string | null; decidedBy?: string | undefined; now: Date },
) =>
  tx.verificationRequest.updateMany({
    where: { userId: decision.userId, status: VERIFICATION_PENDING, ...(decision.requestId ? { id: decision.requestId } : {}) },
    data: { status: decision.status, reason: decision.reason, decidedAt: decision.now, decidedBy: decision.decidedBy ?? null },
  });

export const findRequestById = (id: string) => prisma.verificationRequest.findUnique({ where: { id }, select: { id: true, userId: true } });

const WITH_STUDENT_AND_FILE = {
  user: { select: { id: true, displayName: true, email: true } },
  file: { select: { id: true, originalName: true, mime: true, sizeBytes: true } },
} as const;

/** US-39. The queue, oldest first so it is served in order. */
export const listRequestsByStatus = (status: string, limit: number) =>
  prisma.verificationRequest.findMany({ where: { status }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: limit, include: WITH_STUDENT_AND_FILE });

export const findRequestWithStudentTx = (tx: Tx, id: string) =>
  tx.verificationRequest.findUniqueOrThrow({ where: { id }, include: WITH_STUDENT_AND_FILE });

/** INV-03: the badge. Only a student who is not yet verified qualifies. */
export const markStudentVerified = (tx: Tx, userId: string, now: Date) =>
  tx.user.updateMany({ where: { id: userId, role: 'student', studentVerifiedAt: null }, data: { studentVerifiedAt: now } });

export const findUserEmail = (tx: Tx, userId: string) => tx.user.findUnique({ where: { id: userId }, select: { email: true } });

export const insertAuditEvent = (tx: Tx, data: { action: string; entityId: string; actorId?: string | undefined; data: Record<string, unknown> }) =>
  tx.auditEvent.create({
    data: { action: data.action, entity: 'user', entityId: data.entityId, dataJson: JSON.stringify(data.data), ...(data.actorId ? { actorId: data.actorId } : {}) },
  });
