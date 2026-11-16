import type { Prisma } from '@prisma/client';
import { prisma } from '../../platform/db';

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
