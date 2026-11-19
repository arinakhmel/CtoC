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

export const LEDGER_TOPUP = 'topup' as const;

/** US-26 (OQ-09). The sandbox top-up adds to the customer's balance: a positive entry on that balance (INV-20). */
export const topUpEntry = (ownerId: string, amountKopecks: number) => ({ ownerId, kind: LEDGER_TOPUP, amountKopecks });

export const ESCROW_RELEASED = 'released' as const;
export const LEDGER_PAYOUT = 'payout' as const;
export const LEDGER_COMMISSION = 'commission' as const;
/** `ledger_entries.owner_id` and `balances.owner_id` of the platform's own income (data-model.md). It is not a user id. */
export const PLATFORM_OWNER = 'platform' as const;

/** US-34 sc.1. The student's pay: a positive entry on the student's balance, one per task (INV-19). */
export const payoutEntry = (taskId: string, studentId: string, netKopecks: number) => ({
  ownerId: studentId,
  kind: LEDGER_PAYOUT,
  amountKopecks: netKopecks,
  taskId,
});

/** US-31. The platform's income: a positive entry on the platform's balance, one per task. Not written when the commission is 0 (a ledger entry cannot be 0). */
export const commissionEntry = (taskId: string, commissionKopecks: number) => ({
  ownerId: PLATFORM_OWNER,
  kind: LEDGER_COMMISSION,
  amountKopecks: commissionKopecks,
  taskId,
});

/**
 * US-31, US-34 (INV-08, OQ-22). The split of the price that was taken at publication and stored on the task: it is paid as it was
 * shown on the card, never recomputed from today's rate. Returns null when there is no snapshot (a task published before US-40
 * writes it), or when it does not add up; the accept then refuses and changes nothing.
 */
export function payoutSplitOf(task: { priceKopecks: number; commissionKopecks: number | null; netKopecks: number | null }) {
  const { priceKopecks: gross, commissionKopecks: commission, netKopecks: net } = task;
  if (commission === null || net === null || commission < 0 || net <= 0 || commission + net !== gross) return null;
  return { grossKopecks: gross, commissionKopecks: commission, netKopecks: net };
}

export const LEDGER_WITHDRAWAL = 'withdrawal' as const;
export const LEDGER_WITHDRAWAL_REVERSAL = 'withdrawal_reversal' as const;

/** domain-model.md §3, Withdrawal: (none) → `requested` → `paid` | `rejected`. Nothing leaves `paid` or `rejected` (A-10). */
export const WITHDRAWAL_REQUESTED = 'requested' as const;
export const WITHDRAWAL_PAID = 'paid' as const;
export const WITHDRAWAL_REJECTED = 'rejected' as const;

/** INV-24: a moderator decides only a request that is still open. The first decision wins. */
export const isWithdrawalOpen = (status: string): boolean => status === WITHDRAWAL_REQUESTED;

/** US-36 sc.1 (INV-20). The money leaves the available balance when the request is made: a negative entry on the student's balance. */
export const withdrawalEntry = (withdrawalId: string, studentId: string, amountKopecks: number) => ({
  ownerId: studentId,
  kind: LEDGER_WITHDRAWAL,
  amountKopecks: -amountKopecks,
  withdrawalId,
});

/** US-36, A-10 (INV-20). A rejected request gives the money back: a positive entry of the same amount, one per request. */
export const withdrawalReversalEntry = (withdrawalId: string, studentId: string, amountKopecks: number) => ({
  ownerId: studentId,
  kind: LEDGER_WITHDRAWAL_REVERSAL,
  amountKopecks,
  withdrawalId,
});

/** US-36. The only part of a card number that is ever shown again (`withdrawals.card_last4`). `digits` is already validated. */
export const cardLast4Of = (digits: string): string => digits.slice(-4);
