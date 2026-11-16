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

/**
 * domain-model.md INV-22, A-20. The chat of a task: open from assignment until the task is `done` or `cancelled`
 * (read-only after that), and not open before an executor is chosen.
 */
export const CHAT_OPEN_STATUSES = ['in_progress', 'in_review', 'revision'] as const;
export type ChatState = 'open' | 'readonly' | 'notopen';
export function chatStateOf(status: string): ChatState {
  if ((CHAT_OPEN_STATUSES as readonly string[]).includes(status)) return 'open';
  return status === 'done' || status === 'cancelled' ? 'readonly' : 'notopen';
}

/** domain-model.md §3.1 (US-25): selecting the executor moves a published task to `in_progress`. It is the only way in. */
export const ASSIGNABLE_STATUS = 'published' as const;
export const IN_PROGRESS = 'in_progress' as const;

/** Why the select did not change the task: an executor is already chosen (US-25 sc.2), or the task is not open (not published, or past its deadline). */
export const assignRefusal = (task: { executorId: string | null }): 'TASK_ALREADY_ASSIGNED' | 'TASK_NOT_OPEN' =>
  task.executorId !== null ? 'TASK_ALREADY_ASSIGNED' : 'TASK_NOT_OPEN';
