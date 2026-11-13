import type { Prisma } from '@prisma/client';

/** US-18. Runs on the transaction client of the service (ADR-0007). The (task, student) unique index enforces INV-09. */
export const insertApplication = (tx: Prisma.TransactionClient, data: Prisma.ApplicationUncheckedCreateInput) =>
  tx.application.create({ data });
