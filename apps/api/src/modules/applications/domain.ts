import type { CreateApplicationInput } from '@ctoc/shared';
import type { Prisma } from '@prisma/client';

/** domain-model.md §3.3: an application is born `sent`. The student and the task come from the URL and the session, never the body. */
export const newApplicationData = (
  taskId: string,
  studentId: string,
  input: CreateApplicationInput,
): Prisma.ApplicationUncheckedCreateInput => ({
  taskId,
  studentId,
  note: input.note ?? null,
  status: 'sent',
});
