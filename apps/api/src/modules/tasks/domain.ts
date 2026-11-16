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

/** domain-model.md §3.1 (A-08): the owner may cancel a task only before an executor is chosen, from these states. */
export const CANCELLABLE_BY_OWNER = ['pending_moderation', 'published'] as const;
export const CANCELLED = 'cancelled' as const;

/** Why the owner's delete did not change anything: an executor exists (INV-13, US-22 sc.2), or the state does not allow it. */
export const deleteRefusal = (task: { executorId: string | null }): 'TASK_HAS_EXECUTOR' | 'INVALID_TRANSITION' =>
  task.executorId !== null ? 'TASK_HAS_EXECUTOR' : 'INVALID_TRANSITION';
