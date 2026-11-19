import type { WithdrawalStatus } from '@ctoc/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiPost } from '../../../lib/api';
import { balanceKey } from './balance';
import { financeKey } from './finance';

export interface MyWithdrawal {
  id: string;
  amountKopecks: number;
  cardLast4: string;
  status: WithdrawalStatus;
  createdAt: string;
  processedAt: string | null;
  reason: string | null;
}

export const myWithdrawalsKey = ['withdrawals', 'mine'] as const;

/** GET /api/me/withdrawals (api.md §4.1c). US-36. The student's own requests, newest first. */
export const useMyWithdrawals = () =>
  useQuery({ queryKey: myWithdrawalsKey, queryFn: () => apiFetch<{ withdrawals: MyWithdrawal[] }>('/me/withdrawals').then((body) => body.withdrawals) });

/**
 * POST /api/me/withdrawals (api.md §4.1c). US-36 sc.1. The money leaves the balance at once, so the balance, the finance page and
 * the list are fetched again afterwards.
 */
export const useRequestWithdrawal = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { amountKopecks: number; cardNumber: string }) =>
      apiPost<{ withdrawal: MyWithdrawal; balance: { availableKopecks: number } }>('/me/withdrawals', input),
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: financeKey }),
        client.invalidateQueries({ queryKey: myWithdrawalsKey }),
        client.invalidateQueries({ queryKey: balanceKey }),
      ]),
  });
};
