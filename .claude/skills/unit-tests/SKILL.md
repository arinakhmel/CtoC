---
name: unit-tests
description: Write unit and API tests for a story from its Gherkin scenarios, using the test helpers. One test per scenario, named "US-xx sc.N …", and report a coverage table. Use when asked to write or complete tests for a story.
argument-hint: US-xx
disable-model-invocation: true
---

Write the unit and API tests for story **$ARGUMENTS**. Read `docs/architecture/testing.md` first; it is the strategy. Do not change production code, except to report that a scenario cannot be tested as written.

## 1. Read

1. The story's checklist and the three Gherkin scenarios: `docs/US-nn.md` if it exists, otherwise `docs/requirements.md` §4.
2. Its row in `docs/architecture/traceability.md` §1: the test level tag per scenario (`[API]`, `[UNIT]`, `[DB]`, `[TX]`, `[UI]`) and the expected response code. A ⚠ or ✔ scenario is tested **as decided** (see §4 of that file), with a comment naming the conflict (`// W-xx, decided: …`).
3. The error codes and body shapes in `docs/architecture/api.md`, and the invariants in `domain-model.md` that the scenarios exercise.
4. The existing tests and helpers: `apps/api/tests/helpers/` (`api()`, `resetDb()`, `prisma`, `createUser`, `createTask`, `createApplication`, `createFile`), `packages/shared/tests/helpers.ts` (`codesOf`, `fieldsOf`).

## 2. Write one test per scenario

- Name: `US-nn sc.N <expected behaviour>`. If one rule serves two scenarios, write one test and name both (`US-32 sc.3, US-33 sc.2: …`).
- Level by the tag:
  - **Validation and pure rules** → `packages/shared/tests/*.test.ts`: parse with the schema and assert the error code and field (`codesOf`, `fieldsOf`).
  - **`[API]`** → `apps/api/tests/<module>/<story>.test.ts` with `api()` (supertest). Given = factories (`createUser`, `createTask`, …) after `await resetDb()` in `beforeEach`; When = one request; Then = status, error `code`, body shape from `api.md`, and the resulting state read back from the database.
  - **`[DB]`** → a constraint test next to `schema-constraints.test.ts` (insert the duplicate, expect the unique or CHECK error).
  - **`[TX]`** → rollback test with `vi.spyOn(...).mockRejectedValueOnce(...)` on the last step inside the transaction. Assert that nothing changed and the answer is 500 `INTERNAL_ERROR`.
  - **`[UI]`, `[CONTENT]`** → not here. Write them under `apps/web/tests/` only if asked, otherwise list them as "left for component or e2e tests".
- If the story is atomic or has a counter or money invariant, add the parallel test from `testing.md` §4 and a test named after the invariant (`INV-xx`).
- Assert the **contract, not the implementation**: no mocked Prisma, no assertions on call counts, no message text unless the scenario quotes it.
- No `.only`, no `.skip`, no `setTimeout` waits.
- If the endpoint or module does not exist yet, write the tests anyway only when the user asked for tests first; otherwise stop and say which scenarios are blocked by missing code.

## 3. Run

`pnpm --filter @ctoc/shared test`, `pnpm --filter @ctoc/api exec vitest run -t "US-nn"`, then `pnpm typecheck`. A new test for new behaviour should fail if the behaviour is removed: check the important ones by reasoning, or by temporarily breaking the rule. Report any test that cannot fail.

## 4. Report

A table, one row per scenario and checklist item that is tested at this level:

| Scenario | Level | Test file › test name | Result |
|---|---|---|---|
| sc.1 | API | `apps/api/tests/…` › `US-nn sc.1 …` | passes |

Then the scenarios **not** covered here and why (level, blocked by missing code, decision pending), and the commands you ran.
