# ADR-0002: Modular monolith on the backend, feature folders on the frontend

**Status:** Proposed
**Date:** 2026-10-27

## Context

Many rules are all-or-nothing across entities: selecting an executor must also reserve escrow and update other applications (US-25, US-26), and accepting a result must release funds, credit the student, create an experience record and notify (US-31, US-34, US-37; digest NFR-16). Six people with basic skills work in parallel for 5 weeks, and Claude Code writes much of the code, so the structure has to be easy to follow mechanically.

## Options

| Option | Pros | Cons |
|---|---|---|
| Plain layered/MVC (global `controllers/`, `services/`, `models/`) | Easiest to start. | One story touches many folders, so merge conflicts. Dependency rules are invisible. |
| **Modular monolith** (one process, folder per module, layered inside) | One DB transaction across modules. Folders map to digest entities. Clear ownership. | Needs a written rule for module-to-module calls. |
| Clean/hexagonal everywhere | Very testable. | Ceremony for every dependency. Too slow for this team. |
| Microservices | Independent deploys. | Distributed transactions, several deployables, hosting cost. Conflicts with the atomic rules. |

## Decision

**Backend:** a modular monolith with these modules, which mirror the digest entities: `identity`, `verification`, `tasks` (including moderation), `applications`, `payments` (escrow, ledger, withdrawals), `delivery` (results), `chat`, `notifications`, `experience`, `admin`.

Each module has the same files: `routes.ts` (HTTP only), `service.ts` (use cases, transactions), `repo.ts` (queries), `policy.ts` (who may do what), `domain.ts` (pure state-machine functions), `schemas` from the shared package.

Rules:
1. Routes call only their own service. A service calls another module only through that module's service, inside the caller's transaction.
2. State changes go through `domain.ts` transitions, never by setting a status in a route.
3. Three explicit ports, because they have real alternatives: `PaymentProvider`, `Mailer`, `FileStorage`. Nothing else gets an interface.

**Frontend:** `features/<module>/{api,components,pages}` with the same module names, plus shared `ui/` and `lib/`.

## Consequences

- **Simpler:** a story maps to one backend folder and one frontend folder. Claude Code gets a repeatable template. Transactions span modules.
- **Harder:** the module-call rule must be enforced in review (a lint rule on import paths is an optional later improvement).
- **Postponed:** splitting any module into a separate service.

No disagreement with `options.md`.

## Related stories

US-25, US-26, US-31, US-34, US-37 (cross-module transactions); digest NFR-16, NFR-17.
