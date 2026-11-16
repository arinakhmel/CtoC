import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiClientError, apiFetch, apiPost } from '../../../lib/api';
import { taskKey } from '../../tasks/queries/task';

export interface ChatMessage {
  id: string;
  body: string;
  createdAt: string;
  mine: boolean;
  from: 'customer' | 'executor';
}

/** "Instantly" (US-23/S1, W-18) is a poll every 5 seconds. TanStack Query pauses it while the tab is in the background. */
export const CHAT_POLL_MS = 5000;

export const chatKey = (taskId: string) => ['chat', taskId] as const;

/** An answer that will not change by asking again: not signed in, not a participant, or no such task. Polling stops (api.md §4.3c). */
const isFinalAccessError = (error: unknown): boolean => error instanceof ApiClientError && [401, 403, 404].includes(error.status);

/** GET /api/tasks/:id/messages (api.md §4.3c). The whole latest page is fetched each time, so a missed row is never lost. */
export const useMessages = (taskId: string) =>
  useQuery({
    queryKey: chatKey(taskId),
    queryFn: () => apiFetch<{ messages: ChatMessage[] }>(`/tasks/${encodeURIComponent(taskId)}/messages`).then((body) => body.messages),
    refetchInterval: (query) => (isFinalAccessError(query.state.error) ? false : CHAT_POLL_MS),
  });

/**
 * POST /api/tasks/:id/messages. The list is fetched again afterwards. A 409 CHAT_CLOSED means the task changed since the
 * page was loaded (done or cancelled), so the task is fetched again too and the panel becomes read-only without a reload.
 */
export const useSendMessage = (taskId: string) => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: string) =>
      apiPost<{ message: ChatMessage }>(`/tasks/${encodeURIComponent(taskId)}/messages`, { body }).then((result) => result.message),
    onSuccess: () => client.invalidateQueries({ queryKey: chatKey(taskId) }),
    onError: (error) => {
      if (error instanceof ApiClientError && error.code === 'CHAT_CLOSED') {
        void client.invalidateQueries({ queryKey: taskKey(taskId) });
        void client.invalidateQueries({ queryKey: chatKey(taskId) });
      }
    },
  });
};
