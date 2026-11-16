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

/** domain-model.md §3.3: the statuses an application moves to when the owner selects an executor (US-25). */
export const APPLICATION_SENT = 'sent' as const;
export const APPLICATION_ACCEPTED = 'accepted' as const;
export const APPLICATION_REJECTED = 'rejected' as const;
