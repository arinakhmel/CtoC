import { ApiError } from '../../errors';
import type { PaymentProvider } from '../../platform/ports/payment-provider';
import type { Prisma } from '@prisma/client';
import { ESCROW_HELD, holdEntry, topUpEntry } from './domain';
import { LIMITS } from '@ctoc/shared';
import { debitBalance, ensureBalance, findBalanceTx, incrementBalanceWithin, insertEscrow, insertLedgerEntry } from './repo';

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

/**
 * US-26 (OQ-09, A-06). The sandbox funding of a customer's balance: money from nowhere, clearly labelled in the UI. It is
 * not part of the `PaymentProvider` port, because a real gateway would have its own funding flow. Two steps on the caller's
 * `tx`: the balance goes up, and the `topup` ledger entry is written, so the balance equals the sum of its entries (INV-20).
 * The balance never passes `LIMITS.balanceMaxKopecks`: a top-up that would is 400 VALIDATION_FAILED and changes nothing.
 */
export async function sandboxTopUp(tx: Prisma.TransactionClient, ownerId: string, amountKopecks: number) {
  await ensureBalance(tx, ownerId);
  const added = await incrementBalanceWithin(tx, ownerId, amountKopecks, LIMITS.balanceMaxKopecks);
  if (added.count === 0) throw new ApiError('VALIDATION_FAILED', { details: [{ field: 'amountKopecks', code: 'VALIDATION_FAILED' }] });
  await insertLedgerEntry(tx, topUpEntry(ownerId, amountKopecks));
  return findBalanceTx(tx, ownerId);
}
