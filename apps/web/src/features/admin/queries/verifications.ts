import type { VerificationStatus } from '@ctoc/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiPost } from '../../../lib/api';

export interface ModVerification {
  id: string;
  student: { id: string; displayName: string; email: string };
  file: { id: string; originalName: string; mime: string; sizeBytes: number };
  status: VerificationStatus;
  reason: string | null;
  createdAt: string;
  decidedAt: string | null;
}

const queueKey = ['mod', 'verifications'] as const;

/** GET /api/mod/verifications (api.md §4.8b). US-39. Pending, oldest first. */
export const useVerificationQueue = () =>
  useQuery({
    queryKey: queueKey,
    queryFn: () => apiFetch<{ items: ModVerification[] }>('/mod/verifications?status=pending').then((body) => body.items),
  });

/** POST /api/mod/verifications/:id/approve and /reject (api.md §4.8b). The queue is fetched again afterwards: the row leaves it. */
export const useDecideVerification = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (decision: { id: string; action: 'approve' } | { id: string; action: 'reject'; reason: string }) =>
      apiPost<{ verification: ModVerification }>(
        `/mod/verifications/${encodeURIComponent(decision.id)}/${decision.action}`,
        decision.action === 'reject' ? { reason: decision.reason } : {},
      ),
    onSettled: () => client.invalidateQueries({ queryKey: queueKey }),
  });
};
