import type { SandboxTopUpInput } from '@ctoc/shared';
import type { Prisma, User } from '@prisma/client';
import { prisma } from '../../platform/db';
import type { HoldRequest, PaymentProvider, ReleaseRequest } from '../../platform/ports/payment-provider';
import { ApiError } from '../../errors';
import { listPaidTasks } from '../tasks/service';
import { assertCanReadBalance, assertCanReadFinance, assertCanTopUp } from './policy';
import type { FinanceTaskRow } from './serializer';
import { findBalance, findEscrowByKey } from './repo';
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
