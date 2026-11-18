import { ApiError } from '../../errors';
import type { PaymentProvider } from '../../platform/ports/payment-provider';
import type { Prisma } from '@prisma/client';
import { commissionEntry, ESCROW_HELD, holdEntry, PLATFORM_OWNER, payoutEntry, topUpEntry } from './domain';
import { LIMITS } from '@ctoc/shared';
import { creditBalance, debitBalance, ensureBalance, findBalanceTx, incrementBalanceWithin, insertEscrow, insertLedgerEntry, settleEscrow } from './repo';

/**
 * US-34. A credit under the same limit as a top-up (`LIMITS.balanceMaxKopecks`, ADR-0007), for the student and for the platform
 * alike. A credit that would pass it is refused as a broken invariant, which no honest payout reaches: 500 `INTERNAL_ERROR`, logged,
 * and the caller rolls the whole accept back, so nothing is half paid.
 */
async function creditWithinCap(tx: Prisma.TransactionClient, ownerId: string, amountKopecks: number): Promise<void> {
  if ((await creditBalance(tx, ownerId, amountKopecks, LIMITS.balanceMaxKopecks)).count === 0) {
    console.error(`A credit of ${amountKopecks} kopecks would pass the balance limit of ${LIMITS.balanceMaxKopecks}: the accept was rolled back`);
    throw new ApiError('INTERNAL_ERROR');
  }
}

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

  /**
   * US-31, US-34 (INV-18, INV-19, INV-20). Releases the escrow on the caller's `tx`; it moves no money outside the internal
   * ledger and calls no gateway. Steps: the conditional `held` -> `released`; the student's balance goes up by `net` with its
   * `payout` entry; the platform's balance by `commission` with its `commission` entry (not written when it is 0). The customer
   * was already debited by the hold, so the entries add up to nothing: -price + net + commission = 0. The unique (task, kind)
   * index of the ledger makes a second payout or commission for a task impossible, and the caller rolls back on any failure.
   */
  async release(tx, request) {
    const settled = await settleEscrow(tx, request.taskId, request.grossKopecks, new Date());
    if (settled.count === 0) {
      console.error(`Escrow of task ${request.taskId} is not held for ${request.grossKopecks} kopecks: nothing was released`);
      throw new ApiError('INTERNAL_ERROR'); // an accepted task always has its held escrow: a broken invariant, the accept is rolled back
    }
    const escrow = await tx.escrow.findUniqueOrThrow({ where: { taskId: request.taskId } });
    await creditWithinCap(tx, request.studentId, request.netKopecks);
    await insertLedgerEntry(tx, payoutEntry(request.taskId, request.studentId, request.netKopecks));
    if (request.commissionKopecks > 0) {
      await creditWithinCap(tx, PLATFORM_OWNER, request.commissionKopecks);
      await insertLedgerEntry(tx, commissionEntry(request.taskId, request.commissionKopecks));
    }
    return { escrowId: escrow.id, grossKopecks: request.grossKopecks, commissionKopecks: request.commissionKopecks, netKopecks: request.netKopecks };
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
