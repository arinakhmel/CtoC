import type { SandboxTopUpInput } from '@ctoc/shared';
import type { Prisma, User } from '@prisma/client';
import { prisma } from '../../platform/db';
import type { HoldRequest, PaymentProvider } from '../../platform/ports/payment-provider';
import { assertCanReadBalance, assertCanTopUp } from './policy';
import { findBalance, findEscrowByKey } from './repo';
import { sandboxPaymentProvider, sandboxTopUp } from './sandbox-provider';

/** The provider in use (ADR-0007 §6). The sandbox follows the internal ledger. A real provider replaces this one line. */
export const paymentProvider: PaymentProvider = sandboxPaymentProvider;

export type HoldInput = HoldRequest;

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
