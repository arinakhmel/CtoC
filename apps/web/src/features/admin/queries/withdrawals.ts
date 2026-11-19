import type { WithdrawalStatus } from '@ctoc/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiPost } from '../../../lib/api';

export interface ModWithdrawal {
  id: string;
  student: { id: string; displayName: string };
  amountKopecks: number;
  cardNumber: string | null;
  cardLast4: string;
  status: WithdrawalStatus;
  createdAt: string;
  processedAt: string | null;
  reason: string | null;
}

const queueKey = (status: WithdrawalStatus) => ['mod', 'withdrawals', status] as const;

/** GET /api/mod/withdrawals?status= (api.md §4.1d). A-10. Oldest first. */
export const useWithdrawalQueue = (status: WithdrawalStatus) =>
  useQuery({
    queryKey: queueKey(status),
    queryFn: () => apiFetch<{ withdrawals: ModWithdrawal[] }>(`/mod/withdrawals?status=${status}`).then((body) => body.withdrawals),
  });

/** POST /api/mod/withdrawals/:id/mark-paid and /reject (api.md §4.1d). Every queue is fetched again afterwards. */
export const useDecideWithdrawal = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (decision: { id: string; action: 'mark-paid' } | { id: string; action: 'reject'; reason: string }) =>
      apiPost<{ withdrawal: ModWithdrawal }>(
        `/mod/withdrawals/${encodeURIComponent(decision.id)}/${decision.action}`,
        decision.action === 'reject' ? { reason: decision.reason } : {},
      ),
    onSettled: () => client.invalidateQueries({ queryKey: ['mod', 'withdrawals'] }),
  });
};
