import type { CreateTaskInput, FeedQuery } from '@ctoc/shared';
import type { User } from '@prisma/client';
import { ApiError } from '../../errors';
import { newTaskData } from './domain';
import { assertCanCreateTask, assertCanReadFeed } from './policy';
import { findFeedCursor, findOpenTask, insertTask, listFeed } from './repo';

/**
 * US-13. The details of one task, with the fixed price set by the customer. A task that is not in the feed
 * (pending, rejected, taken, expired) is 404, so its existence is not leaked (US-14 sc.2).
 */
export async function getTask(user: User, id: string) {
  assertCanReadFeed(user);
  const task = await findOpenTask(id, new Date());
  if (!task) throw new ApiError('NOT_FOUND');
  return task;
}

/**
 * US-12. A page of the feed. `nextCursor` is the id of the last task of the page, or null on the last page.
 * `query` is already validated by `validateQuery` in the route. The policy is checked again here, so the
 * service is safe on its own.
 */
export async function getFeed(user: User, query: FeedQuery) {
  assertCanReadFeed(user);

  let after: { id: string; publishedAt: Date } | undefined;
  if (query.cursor) {
    const row = await findFeedCursor(query.cursor);
    if (!row?.publishedAt) throw new ApiError('VALIDATION_FAILED', { details: [{ field: 'cursor', code: 'VALIDATION_FAILED' }] });
    after = { id: row.id, publishedAt: row.publishedAt };
  }

  const rows = await listFeed(new Date(), query.limit, after);
  const page = rows.slice(0, query.limit);
  const last = page[page.length - 1];
  return { tasks: page, nextCursor: rows.length > query.limit && last ? last.id : null };
}

/** US-16. `input` is already validated by `validateBody`. The task always starts in `pending_moderation`. */
export async function createTask(user: User, input: CreateTaskInput) {
  assertCanCreateTask(user);
  return insertTask(newTaskData(input, user.id));
}
