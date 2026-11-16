import type { Prisma } from '@prisma/client';
import { prisma } from '../../platform/db';

/** US-18. Runs on the transaction client of the service (ADR-0007). The (task, student) unique index enforces INV-09. */
export const insertApplication = (tx: Prisma.TransactionClient, data: Prisma.ApplicationUncheckedCreateInput) =>
  tx.application.create({ data });

/** Cap of the list of "Мої відгуки" (US-20). A beginner student has few applications, so there is no paging yet (OQ-26). */
export const MY_APPLICATIONS_LIMIT = 100;

/** US-20. Only the rows of this student, newest first (index student_id, created_at desc), with the task they are for. */
export const listApplicationsOfStudent = (studentId: string) =>
  prisma.application.findMany({
    where: { studentId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: MY_APPLICATIONS_LIMIT,
    select: {
      id: true,
      taskId: true,
      status: true,
      note: true,
      createdAt: true,
      task: { select: { id: true, title: true, priceKopecks: true } },
    },
  });
