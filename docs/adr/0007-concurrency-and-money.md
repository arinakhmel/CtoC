# ADR-0007: Invariants enforced by the database; integer money; simulated payments

**Status:** Proposed
**Date:** 2026-10-27

## Context

The rules that must never break: one executor per task (US-25/S2), no double escrow (US-26/S3), a single credit per task even on duplicate callbacks (US-34/S3), no withdrawal above the balance (US-36/S3), no accept and return on the same submission (US-31/S3, US-32/S2), and `gross = commission + net` to the kopeck (US-35/S2). Payments are simulated for the MVP (digest A-06), but must be replaceable.

## Options

| Option | Pros | Cons |
|---|---|---|
| **DB constraints + conditional `UPDATE … WHERE status = …` in one short transaction** | Guarded by the database even if the code is wrong. Simple to test. | Needs discipline to always go through the pattern. |
| Optimistic `version` column | Good for edit conflicts. | Retry loop and more code for the same guarantee. |
| In-process locks | Quick to write. | Breaks with a second process. Hides bugs. |
| `SELECT … FOR UPDATE` | Familiar on Postgres. | Not available on SQLite. |

## Decision

**1. Each business action is one transaction** in the module service (ADR-0002), and it contains no `await` (the SQLite driver is synchronous, ADR-0004), which removes check-then-act gaps. Zero changed rows means a conflict (HTTP 409).

**2. Invariant → mechanism**

| Invariant | Mechanism |
|---|---|
| One executor per task | `UPDATE tasks SET status='in_progress', executor_id=? WHERE id=? AND status='published' AND executor_id IS NULL`. If 0 rows changed, return 409. |
| One application per student per task | `UNIQUE(task_id, student_id)` |
| Escrow once per task | `UNIQUE(task_id)` on escrow, plus an idempotency key on the request. A repeat returns the existing record (US-26/S3). |
| Single credit per task | `UNIQUE(task_id, kind)` on `ledger_entries` (`kind='payout'`). A duplicate callback is treated as already done (US-34/S3). |
| No over-withdrawal | `UPDATE balances SET available = available - ? WHERE user_id=? AND available >= ?`. If 0 rows changed, return 409. |
| Accept versus return | Both transition only `WHERE status='in_review'`. The first one wins and the other gets 409. |
| One moderator decision | Transition only `WHERE status='pending_moderation'` (tasks) or `'pending'` (verification). |
| Selection fails when funds fail | Selection and escrow are one transaction. A failed hold rolls back the assignment (US-26/S2, A-05). |

**3. State machines** are pure functions in each module's `domain.ts`. The task statuses resolve digest C-02 by splitting the two meanings of «На перевірці»: `pending_moderation`, `published`, `rejected`, `in_progress`, `in_review`, `revision`, `done`, `cancelled`. The UI maps them to the display labels.

**4. Money** is integer kopecks. The commission is stored as basis points on the task **at publication**, so the amount shown on the card (US-15) is the amount paid (digest G-06, A-07). `commission = round_half_up(price × rate)`, `net = price − commission`, and a test asserts `gross = commission + net`.

**5. Ledger.** An append-only `ledger_entries` table (hold, release, commission, payout, withdrawal, refund) is written in the same transaction as every balance change. A script `npm run check:invariants` verifies that balances equal the sum of entries.

**6. Payments** sit behind a `PaymentProvider` port (`hold`, `release`, `refund`, `payout`). The MVP implementation is a simulation that always follows the internal ledger and exposes a clearly labelled "sandbox" top-up. Withdrawals create a request that an admin marks paid or rejected by hand (A-10).

## Consequences

- **Simpler:** the guarantees do not depend on every developer remembering a rule. They are easy to test.
- **Harder:** every action needs a conditional update and a conflict path. Several people must follow one transaction pattern.
- **Postponed:** a real payment provider, disputes and refunds beyond the manual admin action (A-09), automatic deadline handling.
- **If we move to Postgres:** the same constraints stay. Add `FOR UPDATE` or serializable-retry where needed.

No disagreement with `options.md`.

## Related stories

US-18, US-25, US-26, US-28, US-31, US-32, US-34, US-35, US-36, US-40; digest NFR-16 to NFR-20, BR-31 to BR-43, C-02, G-05, G-06.
