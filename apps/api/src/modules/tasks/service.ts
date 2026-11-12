import type { FeedQuery } from '@ctoc/shared';
import type { User } from '@prisma/client';
import { ApiError } from '../../errors';
import { assertCanReadFeed } from './policy';
import { findFeedCursor, listFeed } from './repo';

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
