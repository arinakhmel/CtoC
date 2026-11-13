import type { Task } from '@prisma/client';

export type FeedTaskRow = Pick<
  Task,
  'id' | 'title' | 'description' | 'priceKopecks' | 'commissionKopecks' | 'netKopecks' | 'deadlineAt' | 'publishedAt'
>;

/**
 * api.md §4.12 and §4.13. No customer, status or moderation fields. `commissionKopecks` and `netKopecks` are the
 * snapshot taken at publication (US-15). A published row without a snapshot gives `null` for both and the UI shows no
 * net line: the number is never invented from today's rate. The commission and the net are only both present or both null.
 */
export const serializeFeedTask = (task: FeedTaskRow) => {
  const hasSnapshot = task.commissionKopecks !== null && task.netKopecks !== null;
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    priceKopecks: task.priceKopecks,
    commissionKopecks: hasSnapshot ? task.commissionKopecks : null,
    netKopecks: hasSnapshot ? task.netKopecks : null,
    deadlineAt: task.deadlineAt.toISOString(),
    publishedAt: task.publishedAt?.toISOString() ?? null,
  };
};

/** api.md §4.4. The customer's own view of a task they just created. */
export const serializeOwnTask = (task: Pick<Task, 'id' | 'title' | 'description' | 'priceKopecks' | 'deadlineAt' | 'status' | 'createdAt'>) => ({
  id: task.id,
  title: task.title,
  description: task.description,
  priceKopecks: task.priceKopecks,
  deadlineAt: task.deadlineAt.toISOString(),
  status: task.status,
  createdAt: task.createdAt.toISOString(),
});
