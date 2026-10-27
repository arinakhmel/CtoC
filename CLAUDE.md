# CtoC

CtoC is a micro-task marketplace for **beginner students only**. A customer (small business) posts a task at a **fixed price** (no bidding), a moderator publishes it after checking it is not homework, verified students apply, the customer picks one and reserves the full price (simulated escrow in the MVP), the student delivers files, and on acceptance the student is paid minus commission and gets an immutable experience record «Підтверджено платформою CtoC». 50 stories (US-01…US-50) are in `docs/requirements.md`. The team is 6 students, the demo is in 5 weeks, the budget is 0 UAH, and code is written with Claude Code, so **predictable structure beats cleverness**.

## Stack and commands

pnpm workspaces monorepo, Node 22, TypeScript only. `apps/api` (Express 5, Zod, Prisma, SQLite), `apps/web` (Vite, React, React Router), `packages/shared` (Zod schemas, status enums, limits, error codes, money; consumed as source). Tests: vitest, supertest, Testing Library, Playwright.

| Command | Use |
|---|---|
| `pnpm install` | Install everything (also generates the Prisma client) |
| `pnpm dev` | Migrate the database, start the API on :3001 and the web app on :5173. `.env` is optional (defaults in `.env.example`) |
| `pnpm typecheck` | Types in all packages and in `e2e/` |
| `pnpm test` | Unit, API and component tests |
| `pnpm test:e2e` | Playwright journeys (starts its own servers and database) |
| `pnpm build` | Type-checked build of all packages |
| `pnpm --filter @ctoc/api exec vitest run -t "US-18"` | Tests of one story. Replace `@ctoc/api` with `@ctoc/web` or `@ctoc/shared` |
| `pnpm db:migrate` / `pnpm --filter @ctoc/api db:migrate:dev --name <x>` | Apply / create a migration |
| `pnpm db:reset` | Recreate the local database |

## Documentation map: read this before that

Read only what the task needs. Do not copy it into code comments or into this file.

| Task | Read first |
|---|---|
| New story or story fix | `docs/architecture/traceability.md` (its row, §4 weak spots) → the story in `docs/requirements.md` §4 → `api.md` → `domain-model.md` |
| Endpoint or error code | `docs/architecture/api.md` (§1 table, §3 error codes) |
| Entity rule, status change, invariant | `docs/architecture/domain-model.md` (§2 invariants, §3 state machines) |
| Schema or migration | `docs/architecture/data-model.md` → `docs/adr/0004-data-store-and-files.md` → `apps/api/prisma/README.md` |
| Money, counters, anything atomic | `docs/adr/0007-concurrency-and-money.md` |
| Login, roles, permissions | `docs/adr/0006-authentication.md` |
| New page | `docs/architecture/overview.md` §4 (pages table) → `docs/adr/0008-frontend-stack.md` |
| Writing tests | `docs/architecture/testing.md` |
| A decision that is hard to reverse | `docs/adr/README.md` (when to write an ADR), then `/adr` |
| Unclear or contradictory requirement | `docs/architecture/overview.md` §7 (open questions), `traceability.md` §4 |
| Why a technology was chosen | `docs/adr/` (index in `docs/adr/README.md`), `docs/analysis/options.md` |
| Risks, external dependencies | `docs/architecture/risks.md`, `integrations.md` |
| System picture | `docs/architecture/system.html` (generated from the markdown, not a source of truth) |

## Code rules (from the ADRs)

- **Errors:** `throw new ApiError('CODE')`. The code must exist in `api.md` §3. Body is always `{ error: { code, message, details? } }`. Clients key on `code`. Never build error responses by hand, never leak internals (ADR-0005).
- **Validation:** only with schemas from `@ctoc/shared`, applied by `validateBody(schema)` on the server and the form resolver on the web. Never redefine a limit or enum. Unknown keys are stripped, so the client never sets a price, a status or an executor (US-13, US-40, US-42).
- **State, counters, money:** one `prisma.$transaction`, every check-then-act is a conditional `updateMany` with the `count` checked. Never read-decide-write. Uniqueness and idempotency are database constraints. Money is integer kopecks. Every balance change writes a ledger entry in the same transaction (ADR-0007).
- **Structure:** a feature is one module folder (`routes`, `service`, `serializer`, `policy`, `domain`, `repo`). Statuses change only through `domain.ts`. Cross-module calls only through services. Only three ports: `PaymentProvider`, `Mailer`, `FileStorage` (ADR-0002).
- **Access:** every endpoint has a `policy` check. 403 for a known resource you may not touch, 404 for one you must not know about (ADR-0006).
- **Frontend:** feature folders mirror API modules; one api client; Ukrainian UI text; accessible markup so tests can use roles (`.claude/rules/web.md`).
- **Schema:** Prisma cannot express CHECKs or partial indexes. They go into the migration SQL by hand (`apps/api/prisma/README.md`).
- Path-specific rules load automatically from `.claude/rules/` (`api.md`, `web.md`, `input-docs.md`).

## Definition of done for a story

1. Every checklist item and **every Gherkin scenario** of the story is implemented, as decided where `traceability.md` marks a conflict (⚠/✔).
2. Every scenario has a test named `US-xx sc.N …` at the level in `traceability.md`, asserting the contract, with the race and rollback tests for atomic actions (`testing.md` §8). No `.only` or `.skip`.
3. Contract and design documents changed in the same pull request if the behaviour changed (`api.md`, `domain-model.md`, `data-model.md`, `overview.md` §4).
4. `pnpm typecheck` and `pnpm test` are green (and `pnpm test:e2e` if a journey step changed).
5. `traceability.md` §5 has the status row with code and test files.
6. `/check-story US-xx` shows no row that is not covered, and the `architecture-reviewer` agent reports no blocking deviation.
7. A pull request is open (see below).

## Working with Claude

- **Skills:** `/implement-story US-xx` (plan, approval, implement, update traceability), `/check-story US-xx` (covered / not covered table), `/unit-tests US-xx` (tests from the Gherkin), `/e2e-tests <journey>` (Playwright spec), `/adr <title>` (new decision record).
- **Agent:** `architecture-reviewer` is read-only. It checks the diff against `docs/adr/` and `docs/architecture/` and reports deviations with the ADR or section. Run it before a pull request.
- **Input documents are read-only.** `docs/project_context.md` and `docs/US-*.md` are protected by a hook. Problems go to "Open questions" in `docs/architecture/overview.md`. Existing stories in `docs/requirements.md` are never reworded.
- **Worktrees:** run one story per worktree with `claude -w us-06`; worktrees live in `.claude/worktrees/` (git-ignored).
- **Personal notes:** put them in `CLAUDE.local.md` (git-ignored), not here.
- **Pull request:** after each commit push the branch and open a pull request into `main`: `git push -u origin <branch>` then `gh pr create --base main --fill` (or ask Claude: "open a PR"). Use the PR template if the repo has one. One branch has one open PR; later commits go into it. If its PR was merged, start the branch again from `main`.
- When the design is wrong or silent, **say so**: add an open question, do not decide silently.
