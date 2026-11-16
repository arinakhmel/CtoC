import type { Prisma } from '@prisma/client';
import type { HoldRequest, PaymentProvider } from '../../platform/ports/payment-provider';
import { findEscrowByKey } from './repo';
import { sandboxPaymentProvider } from './sandbox-provider';

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
