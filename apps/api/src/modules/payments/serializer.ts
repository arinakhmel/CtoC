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
