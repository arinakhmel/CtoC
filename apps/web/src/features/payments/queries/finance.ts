import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../../lib/api';

export interface FinanceTask {
  taskId: string;
  title: string;
  grossKopecks: number;
  commissionKopecks: number;
  netKopecks: number;
  paidAt: string;
}

export interface Finance {
  balance: { availableKopecks: number };
  tasks: FinanceTask[];
}

export const financeKey = ['finance', 'mine'] as const;

/** GET /api/me/finance (api.md §4.1b). US-35, US-34. The student's available balance and the breakdown of each paid task. */
export const useFinance = () => useQuery({ queryKey: financeKey, queryFn: () => apiFetch<Finance>('/me/finance') });
