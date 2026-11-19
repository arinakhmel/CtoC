import type { Prisma } from '@prisma/client';
import { prisma } from '../../platform/db';
import { WITHDRAWAL_REQUESTED } from './domain';

type Tx = Prisma.TransactionClient;

/**
 * US-26 (ADR-0007, INV-20). A conditional write: it takes the amount out only if the balance covers it, and `count` 0
 * means it does not (or there is no balance row). The CHECK available_kopecks >= 0 backs it up in the database.
 */
export const debitBalance = (tx: Tx, ownerId: string, amountKopecks: number) =>
  tx.balance.updateMany({
    where: { ownerId, availableKopecks: { gte: amountKopecks } },
    data: { availableKopecks: { decrement: amountKopecks } },
  });

/** INV-12: the task_id and idempotency_key unique indexes allow one escrow per task and per key. */
export const insertEscrow = (tx: Tx, data: Prisma.EscrowUncheckedCreateInput) => tx.escrow.create({ data });

/** Append-only. The (task_id, kind) unique index allows one hold per task. */
export const insertLedgerEntry = (tx: Tx, data: Prisma.LedgerEntryUncheckedCreateInput) => tx.ledgerEntry.create({ data });

export const findEscrowByKey = (idempotencyKey: string) => prisma.escrow.findUnique({ where: { idempotencyKey } });

/** US-26. Makes sure the balance row exists (0 on the first top-up). It changes nothing if it is there. */
export const ensureBalance = (tx: Tx, ownerId: string) =>
  tx.balance.upsert({ where: { ownerId }, create: { ownerId, availableKopecks: 0 }, update: {} });

/**
 * US-26 (ADR-0007). A conditional write: it adds the amount only if the result stays within `maxKopecks`, so the column
 * can never pass the 32-bit integer of the database. The increment is done by the database, so two top-ups at once are
 * both applied. `count` 0 means the cap would be exceeded.
 */
export const incrementBalanceWithin = (tx: Tx, ownerId: string, amountKopecks: number, maxKopecks: number) =>
  tx.balance.updateMany({
    where: { ownerId, availableKopecks: { lte: maxKopecks - amountKopecks } },
    data: { availableKopecks: { increment: amountKopecks } },
  });

export const findBalanceTx = (tx: Tx, ownerId: string) => tx.balance.findUniqueOrThrow({ where: { ownerId } });

export const findBalance = (ownerId: string) => prisma.balance.findUnique({ where: { ownerId } });

/**
 * US-31, US-34 (INV-18, ADR-0007). The conditional update `held` -> `released`, for the full price. `count` 0 means there is no
 * held escrow of that amount for the task, which an accepted task never lacks: the caller treats it as a broken invariant.
 */
export const settleEscrow = (tx: Tx, taskId: string, amountKopecks: number, now: Date) =>
  tx.escrow.updateMany({ where: { taskId, status: 'held', amountKopecks }, data: { status: 'released', settledAt: now } });

/**
 * US-34 (ADR-0007). Adds to a balance, making the row first if the owner has none yet. It is the same conditional write as the
 * top-up: it adds only if the result stays within `maxKopecks`, so the column can never pass the 32-bit integer of the database,
 * and `count` 0 says the cap would be exceeded. The increment is done by the database, so two credits at once both apply.
 */
export const creditBalance = async (tx: Tx, ownerId: string, amountKopecks: number, maxKopecks: number) => {
  await ensureBalance(tx, ownerId);
  return incrementBalanceWithin(tx, ownerId, amountKopecks, maxKopecks);
};

/** US-36 sc.1. A new request. The CHECKs of the table refuse an amount of 0 and a card number kept after processing. */
export const insertWithdrawal = (tx: Tx, data: Prisma.WithdrawalUncheckedCreateInput) => tx.withdrawal.create({ data });

/**
 * US-36, A-10 (INV-24, ADR-0007). The conditional decision `requested` → `paid` | `rejected`. `count` 0 means the request is
 * unknown or already decided; the caller tells the two apart. `data` always clears the full card number.
 */
export const decideWithdrawal = (
  tx: Tx,
  id: string,
  data: { status: 'paid' | 'rejected'; processedBy: string; processedAt: Date; reason?: string },
) => tx.withdrawal.updateMany({ where: { id, status: WITHDRAWAL_REQUESTED }, data: { ...data, cardNumber: null } });

export const findWithdrawalTx = (tx: Tx, id: string) => tx.withdrawal.findUnique({ where: { id } });

/** US-36. The caller's own requests, newest first. The full card number is never selected for the student. */
export const listWithdrawalsOfStudent = (studentId: string, limit: number) =>
  prisma.withdrawal.findMany({
    where: { studentId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit,
    select: { id: true, amountKopecks: true, cardLast4: true, status: true, createdAt: true, processedAt: true, reason: true },
  });

/** A-10. The moderator's queue, oldest first, with the student's display name (never the email). */
export const listWithdrawalsByStatus = (status: string, limit: number) =>
  prisma.withdrawal.findMany({
    where: { status },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: limit,
    include: { student: { select: { id: true, displayName: true } } },
  });

export const findWithdrawalWithStudentTx = (tx: Tx, id: string) =>
  tx.withdrawal.findUniqueOrThrow({ where: { id }, include: { student: { select: { id: true, displayName: true } } } });

/** NFR-15. Append-only. Never holds a card number. */
export const insertAuditEvent = (tx: Tx, data: { actorId: string; action: string; entityId: string; data: Record<string, unknown> }) =>
  tx.auditEvent.create({ data: { actorId: data.actorId, action: data.action, entity: 'withdrawal', entityId: data.entityId, dataJson: JSON.stringify(data.data) } });
