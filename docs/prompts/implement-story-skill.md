---
name: implement-story
description: Implement one user story (US-xx) from the requirements. Reads the story and its traceability row, proposes a plan, waits for approval, then implements it and updates traceability. Use when asked to build, implement or work on a story.
argument-hint: US-xx
disable-model-invocation: true
---

Implement story **$ARGUMENTS**. Work in this order and do not skip the approval step.

## 1. Read (no edits yet)

1. Normalise the argument to `US-nn`. If it is missing or not one of US-01…US-50, ask for it.
2. Read the story: its title, **Чек-лист** and the three Gherkin scenarios. They are in `docs/US-nn.md` if that file exists, otherwise in `docs/requirements.md` §4 (`#### [US-nn]`).
3. Read its row in `docs/architecture/traceability.md` §1: endpoints, pages, entities, and the expected code per scenario (S1, S2, S3).
4. Read the pieces it points to, and nothing more:
   - `docs/architecture/api.md`: the endpoint rows, the error codes and the example bodies it uses;
   - `docs/architecture/domain-model.md`: entity rules, invariants (INV-xx) and the state machine it touches;
   - `docs/architecture/data-model.md`: the tables involved;
   - the ADR it relies on (ADR-0006 for access, ADR-0007 for money and counters).
5. Check `traceability.md` §4 and `overview.md` §7.2 for this story. A scenario marked ⚠ or a row about this story means a known conflict. Use the decided interpretation (✔) if there is one. If it is still open, say so in the plan and propose the cheapest option.
6. Look at what already exists (`apps/api/src/modules/`, `apps/web/src/`, `packages/shared/src/`) so the plan extends it.

## 2. Propose a plan and STOP

Write a short plan with these headings, then **wait for the user's approval. Do not edit any file before the user says to go ahead.**

- **Scope**: one sentence, and which scenarios are in this change.
- **Endpoints**: method, path, access, success status, error codes (from `api.md`). Say if `api.md` needs a change.
- **API files**: module folder and files to create or change (`routes`, `service`, `serializer`, `policy`, `domain`, `repo`).
- **Shared**: new or changed schemas, enums, limits, error codes.
- **Schema**: Prisma model changes and the migration SQL (CHECKs, partial indexes). Say if `data-model.md` needs a change.
- **Pages**: routes from `overview.md` §4, components, queries, which error codes each form handles.
- **Transactions and invariants**: which steps are atomic, the conditional `updateMany` conditions, the INV-xx involved.
- **Tests**: a table, one row per Gherkin scenario: `US-nn sc.N` → test level → the assertion (status, code, state).
- **Open points**: conflicts, assumptions, anything that needs a decision.

## 3. Implement (after approval)

Follow `.claude/rules/api.md` and `.claude/rules/web.md`. Order:

1. Shared schemas and codes (`packages/shared`), then their unit tests.
2. Prisma schema and migration if needed. Check there is no drift (see `apps/api/prisma/README.md`).
3. API module: domain → repo → policy → service (transaction) → serializer → routes. Register the router.
4. Web: queries, page, form with the shared schema. Replace the stub and keep the route list in sync with `overview.md`.
5. Tests: one per scenario, named `US-nn sc.N …` (use the `/unit-tests` approach for API and unit tests). Add the rollback and race tests if the story is atomic.
6. If a document had to change (`api.md`, `data-model.md`), change it in the same pull request.

## 4. Verify and update traceability

1. Run `pnpm typecheck` and `pnpm test`. Fix failures. Run `pnpm test:e2e` if you changed a journey step.
2. Update `docs/architecture/traceability.md` §5 (Implementation status): add or update the row for the story with `Status` (`done`, `partial: <what is missing>`), the main `Code` files and the `Tests` files. If you resolved a ⚠ scenario, update the matrix row and §4.
3. Report: what changed, which scenarios are covered, what is left, and the commands you ran with their results. Suggest `/check-story US-nn` for an independent check.
