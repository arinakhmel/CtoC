import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiPost } from '../../../lib/api';

export const balanceKey = ['balance', 'mine'] as const;

/** GET /api/me/balance (api.md §4.1a). US-26. The available amount in kopecks. */
export const useBalance = () =>
  useQuery({
    queryKey: balanceKey,
    queryFn: () => apiFetch<{ balance: { availableKopecks: number } }>('/me/balance').then((body) => body.balance.availableKopecks),
  });

/** POST /api/me/balance/sandbox-topup (api.md §4.1a). SANDBOX: money from nowhere. The balance is fetched again afterwards. */
export const useTopUp = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (amountKopecks: number) =>
      apiPost<{ balance: { availableKopecks: number } }>('/me/balance/sandbox-topup', { amountKopecks }).then((body) => body.balance.availableKopecks),
    onSuccess: () => client.invalidateQueries({ queryKey: balanceKey }),
  });
};
