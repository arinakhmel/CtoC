import type { CreateTaskInput } from '@ctoc/shared';

/**
 * US-16. The row of a new task. The status is fixed here and nowhere else (INV-05): a client cannot publish
 * directly (US-40/S3). No executor, no commission snapshot (taken at publication, INV-08).
 */
export const newTaskData = (input: CreateTaskInput, customerId: string) => ({
  customerId,
  title: input.title,
  description: input.description,
  priceKopecks: input.priceKopecks,
  deadlineAt: new Date(input.deadlineAt),
  status: 'pending_moderation' as const,
});
