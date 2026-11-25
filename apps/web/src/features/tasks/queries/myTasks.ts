import type { TaskStatus } from '@ctoc/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../../lib/api';

export interface MyTask {
  id: string;
  title: string;
  priceKopecks: number;
  deadlineAt: string;
  status: TaskStatus;
  applicationsCount: number;
}

export const myTasksKey = ['tasks', 'mine'] as const;

/** GET /api/my/tasks (api.md §4.13b). US-50. Every task of the customer in any state, newest first. */
export const useMyTasks = () =>
  useQuery({
    queryKey: myTasksKey,
    queryFn: () => apiFetch<{ tasks: MyTask[] }>('/my/tasks').then((body) => body.tasks),
  });

/**
 * DELETE /api/tasks/:id (api.md §1). US-22 sc.2, US-50 sc.3. 204. The list is asked again whether it worked or not: a 409
 * means the task changed meanwhile, and the list then shows its real state.
 */
export const useDeleteTask = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => apiFetch<void>(`/tasks/${encodeURIComponent(taskId)}`, { method: 'DELETE' }),
    onSettled: () => client.invalidateQueries({ queryKey: myTasksKey }),
  });
};
