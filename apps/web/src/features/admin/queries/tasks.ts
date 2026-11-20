import type { ModTaskStatus } from '@ctoc/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiPost } from '../../../lib/api';

export interface ModTask {
  id: string;
  title: string;
  description: string;
  priceKopecks: number;
  deadlineAt: string;
  customer: { id: string; displayName: string };
  status: ModTaskStatus;
  moderationReason: string | null;
  createdAt: string;
}

const queueKey = ['mod', 'tasks'] as const;

/** GET /api/mod/tasks (api.md §4.14a). US-40. Waiting tasks, oldest first. */
export const useTaskQueue = () =>
  useQuery({
    queryKey: queueKey,
    queryFn: () => apiFetch<{ items: ModTask[] }>('/mod/tasks?status=pending_moderation').then((body) => body.items),
  });

/** POST /api/mod/tasks/:id/publish and /reject (api.md §4.14a). The queue is fetched again afterwards: the row leaves it. */
export const useDecideTask = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (decision: { id: string; action: 'publish' } | { id: string; action: 'reject'; reason: string }) =>
      apiPost<{ task: ModTask }>(`/mod/tasks/${encodeURIComponent(decision.id)}/${decision.action}`, decision.action === 'reject' ? { reason: decision.reason } : {}),
    onSettled: () => client.invalidateQueries({ queryKey: queueKey }),
  });
};
