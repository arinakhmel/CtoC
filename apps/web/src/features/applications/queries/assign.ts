import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../../lib/api';
import { candidatesKey } from './candidates';

export interface AssignResponse {
  task: { id: string; status: string; executorId: string | null; priceKopecks: number };
  escrow: { id: string; status: string; amountKopecks: number };
  applications: { accepted: string | null; rejectedCount: number };
}

/** One key per attempt (US-26 sc.3): a double click or a retry of the same attempt reuses it and is charged once. */
export const newIdempotencyKey = (): string =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;

/**
 * POST /api/tasks/:id/assign (api.md §4.1). US-25: select this application's student as the executor and reserve the
 * price. The list of candidates is fetched again afterwards, whatever the answer, so it shows the real state.
 */
export const useAssign = (taskId: string) => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ applicationId, key }: { applicationId: string; key: string }) =>
      apiFetch<AssignResponse>(`/tasks/${encodeURIComponent(taskId)}/assign`, {
        method: 'POST',
        body: JSON.stringify({ applicationId }),
        headers: { 'Idempotency-Key': key },
      }),
    onSettled: () => client.invalidateQueries({ queryKey: candidatesKey(taskId) }),
  });
};
