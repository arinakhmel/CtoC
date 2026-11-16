/** domain-model.md Escrow and ledger. The sandbox follows the internal ledger (ADR-0007 §6, A-06). */
export const ESCROW_HELD = 'held' as const;
export const LEDGER_HOLD = 'hold' as const;

/** US-26 sc.1. The hold takes the full price out of the customer's available balance: a negative entry on that balance. */
export const holdEntry = (taskId: string, customerId: string, amountKopecks: number) => ({
  ownerId: customerId,
  kind: LEDGER_HOLD,
  amountKopecks: -amountKopecks,
  taskId,
});
