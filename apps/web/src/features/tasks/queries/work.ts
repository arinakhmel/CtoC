import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../../lib/api';
import type { TaskDetails } from './task';

export const myWorkKey = ['tasks', 'work'] as const;

/** GET /api/me/work (api.md §4.13a). US-22. The tasks the student works on, last assigned first. */
export const useMyWork = () =>
  useQuery({
    queryKey: myWorkKey,
    queryFn: () => apiFetch<{ tasks: TaskDetails[] }>('/me/work').then((body) => body.tasks),
  });
