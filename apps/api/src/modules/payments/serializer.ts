/** api.md §4.1a. The available amount in kopecks (ADR-0007: integers only). */
export const serializeBalance = (availableKopecks: number) => ({ balance: { availableKopecks } });

export interface FinanceTaskRow {
  id: string;
  title: string;
  priceKopecks: number;
  commissionKopecks: number;
  netKopecks: number;
  completedAt: Date;
}

/** api.md §4.1b. The amounts are the stored snapshot of the task; `paidAt` is the time of the accept (INV-18). Integers only. */
export const serializeFinance = (availableKopecks: number, tasks: FinanceTaskRow[]) => ({
  balance: { availableKopecks },
  tasks: tasks.map((task) => ({
    taskId: task.id,
    title: task.title,
    grossKopecks: task.priceKopecks,
    commissionKopecks: task.commissionKopecks,
    netKopecks: task.netKopecks,
    paidAt: task.completedAt.toISOString(),
  })),
});

/** The fields of a withdrawal request that its owner may see (api.md §4.1c). Never the full card number. */
export interface WithdrawalRow {
  id: string;
  amountKopecks: number;
  cardLast4: string;
  status: string;
  createdAt: Date;
  processedAt: Date | null;
  reason: string | null;
}

/** api.md §4.1c. Picks the fields one by one, so a full card number on the row can never reach the student. */
export const serializeMyWithdrawal = (withdrawal: WithdrawalRow) => ({
  id: withdrawal.id,
  amountKopecks: withdrawal.amountKopecks,
  cardLast4: withdrawal.cardLast4,
  status: withdrawal.status,
  createdAt: withdrawal.createdAt.toISOString(),
  processedAt: withdrawal.processedAt?.toISOString() ?? null,
  reason: withdrawal.reason,
});

export const serializeWithdrawalCreated = (withdrawal: WithdrawalRow, availableKopecks: number) => ({
  withdrawal: serializeMyWithdrawal(withdrawal),
  balance: { availableKopecks },
});

export const serializeMyWithdrawals = (withdrawals: WithdrawalRow[]) => ({ withdrawals: withdrawals.map(serializeMyWithdrawal) });
