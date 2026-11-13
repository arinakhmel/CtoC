import { apiFetch } from '../../../lib/api';

export interface CreateTaskPayload {
  title: string;
  description: string;
  priceKopecks: number;
  deadlineAt: string;
}

/** POST /api/tasks (api.md §4.4). The server sets the status; the task goes to moderation. */
export const createTask = (payload: CreateTaskPayload) =>
  apiFetch<{ task: { id: string; status: string } }>('/tasks', { method: 'POST', body: JSON.stringify(payload) });
