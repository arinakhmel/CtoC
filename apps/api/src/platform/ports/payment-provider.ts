import type { Prisma } from '@prisma/client';

/** What a provider needs to reserve the money of one task. */
export interface HoldRequest {
  taskId: string;
  customerId: string;
  amountKopecks: number;
  /** One per attempt. A repeat with the same key is the caller's to detect (US-26 sc.3); the provider never charges twice for a task. */
  idempotencyKey: string;
}

/** The reservation that was made. */
export interface Hold {
  id: string;
  taskId: string;
  status: string;
  amountKopecks: number;
  idempotencyKey: string;
}

/**
 * Port `PaymentProvider` (ADR-0002 rule 3, ADR-0007 §6). The MVP implementation is a sandbox that follows the internal
 * ledger (`modules/payments/sandbox-provider.ts`, A-06). It runs on the caller's transaction, so a hold commits or rolls back
 * with the business action (INV-11). A real provider would replace the sandbox without changing its callers.
 *
 * Only `hold` exists now. `release`, `refund` and `payout` are added by the stories that need them (US-31, US-34, A-09),
 * so no method is written before it has a caller.
 */
export interface PaymentProvider {
  /** Reserves the full amount from the customer's balance. Throws ApiError INSUFFICIENT_FUNDS if the balance is short. */
  hold(tx: Prisma.TransactionClient, request: HoldRequest): Promise<Hold>;
}
