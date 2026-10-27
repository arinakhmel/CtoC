---
name: e2e-tests
description: Write a Playwright end-to-end spec for a user journey across several stories, seeded through the API. Use when asked for an e2e test or a journey test, for example "registration-verification" or "order-to-payout".
argument-hint: <journey, for example order-to-payout>
disable-model-invocation: true
---

Write the Playwright spec for the journey **$ARGUMENTS**. Read `docs/architecture/testing.md` §5 first.

## 1. Define the journey

1. Find the journey in `docs/requirements.md` §1 (steps 1 to 7) and the matching step table in `docs/architecture/overview.md` §5 (page, endpoints, state changes, stories). If the name matches none of them, propose the steps and ask.
2. List the stories it crosses and the pages (`overview.md` §4). Check in `traceability.md` §5 that the stories are implemented. If a step is not built, stop and say which one.
3. Decide **which single step** the browser drives. Everything before it is seed.

## 2. Write `e2e/<journey>.spec.ts`

- **One spec file per journey**, one `test.describe` named after the journey. Inside, a few `test` blocks, each a continuous path (not one big test, not one assertion per test).
- **Seed through the API**, not the UI: use the `request` fixture to call the real endpoints (`POST /api/auth/register`, `/login`, `POST /api/tasks`, moderator `publish`, …) with unique emails (for example `` `owner+${Date.now()}@company.com` ``). Put repeated setup in a helper in `e2e/support/`. Sign the browser in by setting the session cookie from the API login, not by typing the password every time.
- **Locate by role, label or visible text**: `getByRole('button', { name: … })`, `getByLabel`, `getByRole('heading')`, `getByRole('status')`. No CSS selectors and no `data-testid`. If a role locator cannot be written, the markup is wrong: report it (see `.claude/rules/web.md`) instead of falling back to a selector.
- **No sleeps.** Never `waitForTimeout`. Use web-first assertions (`expect(locator).toBeVisible()`, `toHaveText`), which retry. For polling features, `expect.poll` or an assertion with a timeout.
- Assert the **outcome the user sees**, and for a money or status change also the state through the API (`request.get(...)`). Assert the Ukrainian text only where the Gherkin quotes it.
- Name each test `Journey <name>: <what the user achieves>`, and add a comment with the stories it covers (`// US-18, US-25, US-26`).
- Do not add retries or increase timeouts to hide a flaky step. Fix the cause.

## 3. Run

`pnpm typecheck` (it checks `e2e/`) and `pnpm test:e2e`. The first time on a machine: `pnpm exec playwright install chromium`. Run the new spec at least twice to see that it is stable. Fix failures in the spec; if the failure is a real bug or missing accessible markup, report it and do not paper over it.

## 4. Report

The spec path, the steps it covers (a table: step → page → stories → assertion), what is seeded through the API and what the browser drives, the commands you ran with their results, and any markup or API gap you found.
