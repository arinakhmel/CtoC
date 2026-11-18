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
 * `hold` (US-25, US-26) and `release` (US-31, US-34) exist. `refund` is added by the story that needs it (A-09), so no method
 * is written before it has a caller.
 */
export interface PaymentProvider {
  /** Reserves the full amount from the customer's balance. Throws ApiError INSUFFICIENT_FUNDS if the balance is short. */
  hold(tx: Prisma.TransactionClient, request: HoldRequest): Promise<Hold>;

  /**
   * US-31, US-34 (INV-18, INV-19). Releases the escrow of an accepted task on the caller's transaction: the escrow goes
   * `held` -> `released`, the student is credited `net`, the platform `commission`, each with its ledger entry. It moves no money outside
   * the internal ledger. A failure throws and the caller rolls back, so the escrow stays `held` and nothing is credited.
   */
  release(tx: Prisma.TransactionClient, request: ReleaseRequest): Promise<Release>;
}

/** What a provider needs to release the escrow of one accepted task (US-31, US-34). The three amounts are the split taken at publication. */
export interface ReleaseRequest {
  taskId: string;
  /** The student who is paid. */
  studentId: string;
  /** The whole escrow: the price (INV-12). Equals `commissionKopecks + netKopecks` (INV-08). */
  grossKopecks: number;
  /** Kept by the platform. May be 0 when the rate was 0. */
  commissionKopecks: number;
  /** Paid to the student. */
  netKopecks: number;
}

/** What the release did. */
export interface Release {
  escrowId: string;
  grossKopecks: number;
  commissionKopecks: number;
  netKopecks: number;
}
