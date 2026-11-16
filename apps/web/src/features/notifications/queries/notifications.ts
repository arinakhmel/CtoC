import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiPost } from '../../../lib/api';

export interface AppNotification {
  id: string;
  type: string;
  text: string;
  payload: unknown;
  read: boolean;
  createdAt: string;
}

export const notificationsKey = ['notifications', 'mine'] as const;

/** GET /api/me/notifications (api.md §4.3b). US-21. Newest first. */
export const useNotifications = () =>
  useQuery({
    queryKey: notificationsKey,
    queryFn: () => apiFetch<{ notifications: AppNotification[] }>('/me/notifications').then((body) => body.notifications),
  });

/** POST /api/me/notifications/:id/read. 204 without a body. The list is fetched again afterwards. */
export const useMarkRead = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPost<void>(`/me/notifications/${encodeURIComponent(id)}/read`, {}),
    onSuccess: () => client.invalidateQueries({ queryKey: notificationsKey }),
  });
};
