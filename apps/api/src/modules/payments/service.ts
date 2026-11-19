import { LIMITS, type CreateWithdrawalInput, type SandboxTopUpInput, type WithdrawalStatus } from '@ctoc/shared';
import type { Prisma, User } from '@prisma/client';
import { prisma } from '../../platform/db';
import type { HoldRequest, PaymentProvider, ReleaseRequest } from '../../platform/ports/payment-provider';
import { ApiError } from '../../errors';
import { listPaidTasks } from '../tasks/service';
import { assertCanReadBalance, assertCanReadFinance, assertCanTopUp, assertCanWithdraw } from './policy';
import type { FinanceTaskRow } from './serializer';
import {
  cardLast4Of,
  WITHDRAWAL_PAID,
  WITHDRAWAL_REJECTED,
  WITHDRAWAL_REQUESTED,
  withdrawalEntry,
  withdrawalReversalEntry,
} from './domain';
import {
  creditBalance,
  debitBalance,
  decideWithdrawal,
  findBalance,
  findBalanceTx,
  findEscrowByKey,
  findWithdrawalTx,
  findWithdrawalWithStudentTx,
  insertAuditEvent,
  insertLedgerEntry,
  insertWithdrawal,
  listWithdrawalsByStatus,
  listWithdrawalsOfStudent,
} from './repo';
import { sandboxPaymentProvider, sandboxTopUp } from './sandbox-provider';

/** The provider in use (ADR-0007 §6). The sandbox follows the internal ledger. A real provider replaces this one line. */
export const paymentProvider: PaymentProvider = sandboxPaymentProvider;

export type HoldInput = HoldRequest;
export type ReleaseInput = ReleaseRequest;

/**
 * US-26 sc.1, sc.2 (INV-11, INV-12, ADR-0007). Reserves the full price of a task through the `PaymentProvider` port, on the
 * caller's `tx`, so it commits or rolls back with the selection of the executor. 422 INSUFFICIENT_FUNDS if the balance is short.
 */
export const holdEscrow = (tx: Prisma.TransactionClient, input: HoldInput) => paymentProvider.hold(tx, input);

/** US-26 sc.3. The escrow made with this key, if any: a repeated request with it gets the same result and no second charge. */
export const getEscrowByKey = (idempotencyKey: string) => findEscrowByKey(idempotencyKey);

/**
 * US-26 (OQ-09). The sandbox top-up of the caller's balance, in one transaction: the balance goes up and the `topup` ledger
 * entry is written, or neither (INV-20, ADR-0007). `input` is already validated. Returns the new available amount.
 */
export async function topUpBalance(user: User, input: SandboxTopUpInput): Promise<number> {
  assertCanTopUp(user);
  const balance = await prisma.$transaction((tx) => sandboxTopUp(tx, user.id, input.amountKopecks));
  return balance.availableKopecks;
}

/** US-26. The caller's available balance in kopecks. No balance row yet means 0. Only the caller's own balance is read. */
export async function getMyBalance(user: User): Promise<number> {
  assertCanReadBalance(user);
  return (await findBalance(user.id))?.availableKopecks ?? 0;
}

/**
 * US-35, US-34. The student's available balance and the breakdown of the tasks they were paid for, from the snapshot stored on
 * each task (A-07): nothing is recalculated. A done task without a split or a completion time is a broken invariant (OQ-39 a):
 * logged and 500 INTERNAL_ERROR, neither recomputed nor left out. Only the caller's own tasks are read.
 */
export async function getMyFinance(user: User): Promise<{ availableKopecks: number; tasks: FinanceTaskRow[] }> {
  assertCanReadFinance(user);
  const availableKopecks = (await findBalance(user.id))?.availableKopecks ?? 0;
  const tasks = (await listPaidTasks(user.id)).map((task): FinanceTaskRow => {
    if (task.commissionKopecks === null || task.netKopecks === null || task.completedAt === null) {
      console.error(`Task ${task.id} is done but has no price split or completion time: it cannot be shown on the finance page (OQ-39 a)`);
      throw new ApiError('INTERNAL_ERROR');
    }
    return { ...task, commissionKopecks: task.commissionKopecks, netKopecks: task.netKopecks, completedAt: task.completedAt };
  });
  return { availableKopecks, tasks };
}

/**
 * US-31, US-34 sc.1, sc.2, sc.3 (INV-18, INV-19, INV-20, ADR-0007). Releases the escrow of an accepted task through the
 * `PaymentProvider` port, on the caller's `tx`, so it commits or rolls back with the accept. The student gets `net` on the
 * balance, the platform `commission`. A provider failure throws and rolls the whole accept back: the escrow stays `held` and
 * nothing is credited (US-34 sc.2, W-06).
 */
export const releaseEscrow = (tx: Prisma.TransactionClient, input: ReleaseInput) => paymentProvider.release(tx, input);

/**
 * US-36 sc.1, sc.3 (INV-02, INV-20, ADR-0007, A-10). A verified student asks to withdraw `amountKopecks` to the card. One transaction:
 * the conditional debit of the available balance (nothing, or too little: 422 INSUFFICIENT_BALANCE and nothing changes), the
 * request `requested` with the card number (kept only until it is processed) and its last four digits, and the negative
 * `withdrawal` ledger entry. Two requests at once cannot both take the same money: the debit is one conditional write. `input` is
 * already validated (16 digits and Luhn, sc.2). Returns the request and the new available balance.
 */
export async function requestWithdrawal(user: User, input: CreateWithdrawalInput) {
  assertCanWithdraw(user);
  // No balance can be above the cap, so a larger amount is short of money anyway; refusing it here also keeps the number
  // within the 32-bit integer of the database column.
  if (input.amountKopecks > LIMITS.balanceMaxKopecks) throw new ApiError('INSUFFICIENT_BALANCE');
  return prisma.$transaction(async (tx) => {
    const debited = await debitBalance(tx, user.id, input.amountKopecks);
    if (debited.count === 0) throw new ApiError('INSUFFICIENT_BALANCE');
    const withdrawal = await insertWithdrawal(tx, {
      studentId: user.id,
      amountKopecks: input.amountKopecks,
      cardNumber: input.cardNumber,
      cardLast4: cardLast4Of(input.cardNumber),
      status: WITHDRAWAL_REQUESTED,
    });
    await insertLedgerEntry(tx, withdrawalEntry(withdrawal.id, user.id, input.amountKopecks));
    const balance = await findBalanceTx(tx, user.id);
    return { withdrawal, availableKopecks: balance.availableKopecks };
  });
}

/** US-36. The caller's own withdrawal requests, newest first, without the card number. */
export async function getMyWithdrawals(user: User) {
  assertCanWithdraw(user);
  return listWithdrawalsOfStudent(user.id, LIMITS.withdrawalsMax);
}

/**
 * A-10 (OQ-10, OQ-42). The withdrawal requests in one status, oldest first, for the moderator who pays them by hand. The caller
 * (the admin module) has already checked the moderator role (INV-25). Read only, so no transaction.
 */
export const listWithdrawalsForModeration = (status: WithdrawalStatus) => listWithdrawalsByStatus(status, LIMITS.withdrawalsMax);

/** INV-24. Why a decision changed nothing: an unknown request is 404, a decided one is 409 ALREADY_DECIDED. */
async function decisionConflict(tx: Prisma.TransactionClient, id: string): Promise<ApiError> {
  const existing = await findWithdrawalTx(tx, id);
  return new ApiError(existing === null ? 'NOT_FOUND' : 'ALREADY_DECIDED');
}

/**
 * A-10 (INV-24, NFR-15). The moderator records that the money was sent to the card. One transaction: the conditional update
 * `requested` → `paid`, which also clears the full card number, and the audit event. No balance changes: the money already left
 * the balance when the request was made. The caller has already checked the moderator role.
 */
export async function markWithdrawalPaid(moderatorId: string, id: string) {
  return prisma.$transaction(async (tx) => {
    const moved = await decideWithdrawal(tx, id, { status: WITHDRAWAL_PAID, processedBy: moderatorId, processedAt: new Date() });
    if (moved.count === 0) throw await decisionConflict(tx, id);
    const withdrawal = await findWithdrawalWithStudentTx(tx, id);
    await insertAuditEvent(tx, { actorId: moderatorId, action: 'withdrawal.paid', entityId: id, data: { amountKopecks: withdrawal.amountKopecks } });
    return withdrawal;
  });
}

/**
 * A-10 (INV-20, INV-24, NFR-15). The moderator refuses a request, with a reason the student sees. One transaction: the conditional
 * update `requested` → `rejected` (card number cleared), the amount credited back to the student's balance with a
 * `withdrawal_reversal` entry, and the audit event. A credit that would pass the balance cap is a broken invariant: 500, logged,
 * and nothing changes. The caller has already checked the moderator role and validated the reason.
 */
export async function rejectWithdrawal(moderatorId: string, id: string, reason: string) {
  return prisma.$transaction(async (tx) => {
    const moved = await decideWithdrawal(tx, id, { status: WITHDRAWAL_REJECTED, processedBy: moderatorId, processedAt: new Date(), reason });
    if (moved.count === 0) throw await decisionConflict(tx, id);
    const withdrawal = await findWithdrawalWithStudentTx(tx, id);
    if ((await creditBalance(tx, withdrawal.studentId, withdrawal.amountKopecks, LIMITS.balanceMaxKopecks)).count === 0) {
      console.error(`Returning ${withdrawal.amountKopecks} kopecks of withdrawal ${id} would pass the balance limit: the rejection was rolled back`);
      throw new ApiError('INTERNAL_ERROR');
    }
    await insertLedgerEntry(tx, withdrawalReversalEntry(id, withdrawal.studentId, withdrawal.amountKopecks));
    await insertAuditEvent(tx, { actorId: moderatorId, action: 'withdrawal.rejected', entityId: id, data: { amountKopecks: withdrawal.amountKopecks, reason } });
    return withdrawal;
  });
}
