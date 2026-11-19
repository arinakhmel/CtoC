import { isWithdrawalOpen } from '../payments/domain';

/** A withdrawal request as the moderator's queue reads it (api.md §4.1d). */
export interface ModWithdrawalRow {
  id: string;
  amountKopecks: number;
  cardNumber: string | null;
  cardLast4: string;
  status: string;
  createdAt: Date;
  processedAt: Date | null;
  reason: string | null;
  student: { id: string; displayName: string };
}

/**
 * api.md §4.1d, OQ-42. The full card number is given only to a moderator and only while the request is `requested`, because
 * the payment is made by hand. After processing the database has already cleared it; the status check here is a second guard.
 * The student's email is never in it.
 */
export const serializeModWithdrawal = (withdrawal: ModWithdrawalRow) => ({
  id: withdrawal.id,
  student: { id: withdrawal.student.id, displayName: withdrawal.student.displayName },
  amountKopecks: withdrawal.amountKopecks,
  cardNumber: isWithdrawalOpen(withdrawal.status) ? withdrawal.cardNumber : null,
  cardLast4: withdrawal.cardLast4,
  status: withdrawal.status,
  createdAt: withdrawal.createdAt.toISOString(),
  processedAt: withdrawal.processedAt?.toISOString() ?? null,
  reason: withdrawal.reason,
});

export const serializeModWithdrawals = (withdrawals: ModWithdrawalRow[]) => ({ withdrawals: withdrawals.map(serializeModWithdrawal) });
