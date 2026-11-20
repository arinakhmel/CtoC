import type { ModVerificationsQuery, WithdrawalStatus } from '@ctoc/shared';
import type { User } from '@prisma/client';
import { listWithdrawalsForModeration, markWithdrawalPaid, rejectWithdrawal } from '../payments/service';
import { decideByModerator, listVerificationQueue } from '../verification/service';
import { assertModerator } from './policy';

/**
 * A-10 (OQ-10, OQ-42). The back office of withdrawals. The requests, the balances and the ledger belong to the payments module,
 * so every step goes through its service (ADR-0002 rule 1): this module only checks that the caller is a moderator (INV-25).
 */
export function getWithdrawalQueue(user: User, status: WithdrawalStatus) {
  assertModerator(user);
  return listWithdrawalsForModeration(status);
}

/** A-10. The moderator paid the request by hand: `requested` → `paid`, card number cleared, audited (api.md §4.1d). */
export function payWithdrawal(user: User, id: string) {
  assertModerator(user);
  return markWithdrawalPaid(user.id, id);
}

/** A-10. The moderator refuses the request with a reason: `requested` → `rejected`, the money goes back (api.md §4.1d). */
export function refuseWithdrawal(user: User, id: string, reason: string) {
  assertModerator(user);
  return rejectWithdrawal(user.id, id, reason);
}

/** US-39. The queue of student documents. The requests belong to the verification module (ADR-0002): this only checks the role. */
export function getVerificationQueue(user: User, query: ModVerificationsQuery) {
  assertModerator(user);
  return listVerificationQueue(query);
}

/** US-39/S1. The moderator approves the document they saw: the student gets the badge (INV-03). */
export function approveVerification(user: User, id: string) {
  assertModerator(user);
  return decideByModerator(user.id, id, { approve: true });
}

/** US-39/S2. The moderator rejects it with a reason: no badge, the student is told why. */
export function rejectVerification(user: User, id: string, reason: string) {
  assertModerator(user);
  return decideByModerator(user.id, id, { approve: false, reason });
}
