import { useInfiniteQuery } from '@tanstack/react-query';
import { apiFetch } from '../../../lib/api';

export interface FeedTask {
  id: string;
  title: string;
  description: string;
  priceKopecks: number;
  deadlineAt: string;
  publishedAt: string | null;
}

export interface FeedResponse {
  tasks: FeedTask[];
  nextCursor: string | null;
}

export const feedKey = ['tasks', 'feed'] as const;

/** GET /api/tasks (api.md §4.12). Pass the `nextCursor` of the previous page to get the next one. */
export const getFeed = (cursor?: string | null) =>
  apiFetch<FeedResponse>(cursor ? `/tasks?cursor=${encodeURIComponent(cursor)}` : '/tasks');

/** The feed as pages. `fetchNextPage` follows `nextCursor`; `hasNextPage` is false on the last page. */
export const useFeed = () =>
  useInfiniteQuery({
    queryKey: feedKey,
    queryFn: ({ pageParam }) => getFeed(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
