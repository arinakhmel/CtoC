import type { Task } from '@prisma/client';

export type FeedTaskRow = Pick<Task, 'id' | 'title' | 'description' | 'priceKopecks' | 'deadlineAt' | 'publishedAt'>;

/** api.md §4.12. No customer, status or moderation fields. Net price and commission come with US-15. */
export const serializeFeedTask = (task: FeedTaskRow) => ({
  id: task.id,
  title: task.title,
  description: task.description,
  priceKopecks: task.priceKopecks,
  deadlineAt: task.deadlineAt.toISOString(),
  publishedAt: task.publishedAt?.toISOString() ?? null,
});
