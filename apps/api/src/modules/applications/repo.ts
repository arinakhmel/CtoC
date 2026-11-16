import type { Prisma } from '@prisma/client';
import { prisma } from '../../platform/db';
import { APPLICATION_ACCEPTED, APPLICATION_REJECTED, APPLICATION_SENT } from './domain';

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

/** US-24. The applications of one task, in the order they came (oldest first), capped. */
export const listApplicationsOfTask = (taskId: string, limit: number) =>
  prisma.application.findMany({ where: { taskId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: limit });

/** US-25. The application, only if it belongs to this task (an application of another task is "not found"). */
export const findApplicationOfTask = (id: string, taskId: string) => prisma.application.findFirst({ where: { id, taskId } });

/** US-25 sc.1 (INV-10). Conditional: only a `sent` application of this task becomes `accepted`. `count` 0 means it was already decided. */
export const acceptApplication = (tx: Prisma.TransactionClient, id: string, taskId: string, now: Date) =>
  tx.application.updateMany({ where: { id, taskId, status: APPLICATION_SENT }, data: { status: APPLICATION_ACCEPTED, decidedAt: now } });

/** US-25 sc.1. Every other `sent` application of the task becomes `rejected`. */
export const rejectOtherApplications = (tx: Prisma.TransactionClient, taskId: string, exceptId: string, now: Date) =>
  tx.application.updateMany({
    where: { taskId, status: APPLICATION_SENT, id: { not: exceptId } },
    data: { status: APPLICATION_REJECTED, decidedAt: now },
  });

/** US-26 sc.3. For a repeated request: which application won and how many were rejected. */
export const findAcceptedOfTask = (taskId: string) => prisma.application.findFirst({ where: { taskId, status: APPLICATION_ACCEPTED } });
export const countRejectedOfTask = (taskId: string) => prisma.application.count({ where: { taskId, status: APPLICATION_REJECTED } });
