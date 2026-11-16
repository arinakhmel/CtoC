import { ApiError } from '../../errors';
import type { PaymentProvider } from '../../platform/ports/payment-provider';
import { ESCROW_HELD, holdEntry } from './domain';
import { debitBalance, insertEscrow, insertLedgerEntry } from './repo';

/**
 * The sandbox `PaymentProvider` (ADR-0007 §6, A-06): no card, no gateway, it only follows the internal ledger. Three steps on
 * the caller's `tx`: the conditional debit (422 INSUFFICIENT_FUNDS if the balance is short, and the caller rolls back), the
 * escrow `held`, and the `hold` ledger entry. The unique indexes make a second hold for a task or a key impossible (INV-12).
 */
export const sandboxPaymentProvider: PaymentProvider = {
  async hold(tx, request) {
    const debited = await debitBalance(tx, request.customerId, request.amountKopecks);
    if (debited.count === 0) throw new ApiError('INSUFFICIENT_FUNDS');
    const escrow = await insertEscrow(tx, {
      taskId: request.taskId,
      customerId: request.customerId,
      amountKopecks: request.amountKopecks,
      status: ESCROW_HELD,
      idempotencyKey: request.idempotencyKey,
    });
    await insertLedgerEntry(tx, holdEntry(request.taskId, request.customerId, request.amountKopecks));
    return escrow;
  },
};
