import { useMutation } from '@tanstack/react-query';
import { apiPost } from '../../../lib/api';

export interface Application {
  id: string;
  taskId: string;
  status: 'sent' | 'accepted' | 'rejected';
  note: string | null;
  createdAt: string;
}

/**
 * POST /api/tasks/:id/applications (api.md §4.3). US-18: one click, so the body is empty. There is no price field
 * (US-13, US-42). The note of US-19 is added by that story.
 */
export const useApply = (taskId: string) =>
  useMutation({
    mutationFn: () =>
      apiPost<{ application: Application }>(`/tasks/${encodeURIComponent(taskId)}/applications`, {}).then((body) => body.application),
  });
