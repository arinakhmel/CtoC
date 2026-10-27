---
name: check-story
description: Check whether the implementation of a story covers every acceptance criterion and every Gherkin scenario. Produces a covered / not covered table with references to code and tests. Read-only. Use after implementing a story or before a pull request.
argument-hint: US-xx
disable-model-invocation: true
allowed-tools: Read, Grep, Glob, Bash(git diff:*), Bash(git log:*), Bash(git status:*), Bash(pnpm test:*), Bash(pnpm typecheck:*), Bash(pnpm --filter * test:*), Bash(pnpm --filter * exec vitest:*)
---

Check story **$ARGUMENTS**. You do not edit any file.

## 1. Collect the requirements

1. Read the story from `docs/US-nn.md` if it exists, otherwise from `docs/requirements.md` §4 (`#### [US-nn]`). List each **checklist item** (C1, C2, …) and the three scenarios (**sc.1**, **sc.2**, **sc.3**), quoting the *Then* step.
2. Read the row in `docs/architecture/traceability.md` §1 and §4: expected endpoint, page, response code per scenario, and any ⚠ or ✔ mark. A ✔ scenario is checked **against the decision**, not against the original wording.

## 2. Find the implementation and the tests

- Endpoints: the module in `apps/api/src/modules/`, the route in `routes.ts`, the rules in `service.ts`, `policy.ts` and `domain.ts`. Schema and migration in `apps/api/prisma/`. Shared rules in `packages/shared/src/`.
- Pages: `apps/web/src/` (features, pages, `routes.config.ts`).
- Tests: grep for `US-nn sc.` in `apps/*/tests/`, `packages/*/tests/` and `e2e/`.
- Run only the tests of this story and record the result: `pnpm --filter @ctoc/api exec vitest run -t "US-nn"`, and the same for `@ctoc/shared` and `@ctoc/web`. If there is an e2e spec for the journey, say whether it exists but do not run it unless asked.

## 3. Decide for each item

A row is **covered** only if **both** are true:
1. the behaviour is implemented (cite `file:line`), and
2. a test named `US-nn sc.N …` (or for a checklist item, a test that asserts it) exists **and passes**.

Otherwise: **partly covered** (code without a test, a test that does not assert the *Then* step, or a test that only mocks the thing under test) or **not covered**. Do not mark a row covered because the code looks right.

## 4. Report

A table, one row per checklist item and per scenario:

| Item | Requirement (short) | Status | Code | Test |
|---|---|---|---|---|
| C1 | … | covered / partly / not covered | `path:line` | `path` › `US-nn sc.N …` |
| sc.1 | Then … → 201 | … | … | … |

Then:
- the numbers: `covered x / y`;
- **Gaps**: for each row that is not covered, the smallest change that would cover it;
- **Rule violations** noticed on the way (a status changed outside `domain.ts`, a read-then-write instead of a conditional `updateMany`, a price accepted from the client): point to the rule in `.claude/rules/` or the ADR. Do not turn this into a style review;
- the traceability status row, and whether it matches what you found;
- the exact test commands you ran and their results.
