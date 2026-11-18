import type { Prisma } from '@prisma/client';

type Tx = Prisma.TransactionClient;

/**
 * US-37 (INV-21). Inserts the record. The unique `task_id` index allows at most one per task, so a second insert for the same
 * task throws and the caller's transaction rolls back. Records are never updated or deleted by the application.
 */
export const insertExperienceRecord = (tx: Tx, data: { studentId: string; taskId: string; title: string; description: string; completedAt: Date }) =>
  tx.experienceRecord.create({ data, select: { id: true } });
