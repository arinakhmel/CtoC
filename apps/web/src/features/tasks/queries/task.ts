import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../../lib/api';
import type { TaskStatus } from '@ctoc/shared';
import type { FeedTask } from './feed';

/** The executor also gets `status` and `assignedAt` (api.md §4.13a, US-22). */
export type TaskDetails = FeedTask & { status?: TaskStatus; assignedAt?: string | null };

export const taskKey = (id: string) => ['tasks', 'detail', id] as const;

/** GET /api/tasks/:id (api.md §4.13). */
export const useTask = (id: string) =>
  useQuery({
    queryKey: taskKey(id),
    queryFn: () => apiFetch<{ task: TaskDetails }>(`/tasks/${encodeURIComponent(id)}`).then((body) => body.task),
  });
