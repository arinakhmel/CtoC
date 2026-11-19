import type { Prisma } from '@prisma/client';
import { prisma } from '../../platform/db';

type Tx = Prisma.TransactionClient;

/**
 * US-37 (INV-21). Inserts the record. The unique `task_id` index allows at most one per task, so a second insert for the same
 * task throws and the caller's transaction rolls back. Records are never updated or deleted by the application.
 */
export const insertExperienceRecord = (tx: Tx, data: { studentId: string; taskId: string; title: string; description: string; completedAt: Date }) =>
  tx.experienceRecord.create({ data, select: { id: true } });

/**
 * US-37 sc.1, sc.3 (INV-21). The student's records, newest first (the index `(student_id, completed_at DESC)`), then by id for
 * a tie. Only the records of a `done` task (US-37 sc.2): a task that is not done has none, and this keeps it so.
 */
export const listExperienceOfStudent = (studentId: string, limit: number) =>
  prisma.experienceRecord.findMany({
    where: { studentId, task: { status: 'done' } },
    orderBy: [{ completedAt: 'desc' }, { id: 'desc' }],
    take: limit,
    select: { id: true, title: true, description: true, completedAt: true },
  });
