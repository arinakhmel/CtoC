import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiPost } from '../../../lib/api';

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

/** GET /api/tasks/:id/messages (api.md §4.3c). The whole latest page is fetched each time, so a missed row is never lost. */
export const useMessages = (taskId: string) =>
  useQuery({
    queryKey: chatKey(taskId),
    queryFn: () => apiFetch<{ messages: ChatMessage[] }>(`/tasks/${encodeURIComponent(taskId)}/messages`).then((body) => body.messages),
    refetchInterval: CHAT_POLL_MS,
  });

/** POST /api/tasks/:id/messages. The list is fetched again afterwards. */
export const useSendMessage = (taskId: string) => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: string) =>
      apiPost<{ message: ChatMessage }>(`/tasks/${encodeURIComponent(taskId)}/messages`, { body }).then((result) => result.message),
    onSuccess: () => client.invalidateQueries({ queryKey: chatKey(taskId) }),
  });
};
