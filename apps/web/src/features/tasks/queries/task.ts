import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../../lib/api';
import type { FeedTask } from './feed';

export type TaskDetails = FeedTask;

export const taskKey = (id: string) => ['tasks', 'detail', id] as const;

/** GET /api/tasks/:id (api.md §4.13). */
export const useTask = (id: string) =>
  useQuery({
    queryKey: taskKey(id),
    queryFn: () => apiFetch<{ task: TaskDetails }>(`/tasks/${encodeURIComponent(id)}`).then((body) => body.task),
  });
