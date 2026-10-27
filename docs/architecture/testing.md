# CtoC: Testing Strategy

How we test **this** project. The scenarios come from `docs/requirements.md` (50 stories, 150 Gherkin scenarios) and the matrix in [`traceability.md`](traceability.md). The rules to protect come from [`domain-model.md`](domain-model.md), [`api.md`](api.md) and the ADRs (mainly ADR-0007).

## 1. Test pyramid

The shape is set by where the rules live. In [`traceability.md`](traceability.md) §2, **118 of 150 scenarios** (79%) are checked through the HTTP API, because almost every rule is a server rule (permissions, status transitions, money, uniqueness). Only 14 need a browser, 11 are static content, and 4 are database limits. So our pyramid has a thick middle.

| Level | Tool | Share of tests | What it tests | Why this share |
|---|---|---|---|---|
| **Unit** | vitest in `packages/shared` and pure `domain.ts` files | about 35% | Zod schemas, limits, money rounding, upload rules, state-machine transitions | Pure and instant. Every validation rule in the Gherkin edge cases has a unit test, so API tests only need one case per rule. |
| **API integration** | vitest + supertest in `apps/api`, real SQLite test DB | about 50% | One scenario = one HTTP request: status code, error code, response shape, resulting state. Constraints and transactions | Where the rules are. Real database, because the invariants are enforced by it (ADR-0007). |
| **Component** | vitest + jsdom + Testing Library in `apps/web` | about 10% | Pages render what the router promises, forms show the error for each `code`, the API client maps errors | Fast feedback on UI behaviour without a browser. |
| **End-to-end** | Playwright (Chromium) at the repo root | about 5%, at most one spec per user journey | A journey across stories (registration → verification → apply → select → deliver → accept) | Slow and fragile, so it proves the pieces are wired together, not the rules. Rules are tested below. |

Numbers are targets for the whole project, not per story. The skeleton today has 55 unit, 30 API and 37 component tests and 1 e2e smoke test (infrastructure only).

## 2. From a Gherkin scenario to a test

**One scenario = one test.** A story with three scenarios has at least three tests.

**Naming.** `US-<nn> sc.<N> <expected behaviour>`, where `N` is 1 (Happy Path), 2 (Edge Case 1) or 3 (Edge Case 2). The behaviour is written in plain English from the *Then* step:

```ts
it('US-18 sc.2: applying twice to the same task answers 409 ALREADY_APPLIED', async () => { … });
```

- If one rule serves two scenarios (US-32 sc.3 and US-33 sc.2), write one test and name both: `US-32 sc.3, US-33 sc.2: …`.
- Infrastructure tests, which protect a document or a mechanism rather than a scenario, are named after the document section: `api.md §3 error code dictionary …`, `data-model.md §2 INV-09 …`.
- A scenario marked ⚠ or ✔ in `traceability.md` is tested **as decided**, with a comment naming the conflict (`// W-02, decided: variant B`). Do not silently bend the test to the wording of a scenario we know is contradictory.

**Structure.** *Given* becomes setup through factories or the real API, *When* is one action, *Then* is the assertions:

```ts
it('US-25 sc.2: a second assignment answers 409 TASK_ALREADY_ASSIGNED', async () => {
  // Given: a customer, a published task with an executor already assigned
  // When: the customer assigns another applicant
  // Then: 409 and the documented error body, and nothing changed
});
```

**Assert the contract, not the implementation.** Assert only what a client or the database can observe:
- the HTTP status and the error `code`, and the body shape from `api.md`;
- the state afterwards (read through the API or the database), for example the task status and executor;
- that nothing else changed when the answer is an error.

Do not assert which function was called, do not mock Prisma, and do not assert the Ukrainian message text unless the scenario quotes it (then use the exact quote).

**Test level for a scenario** is the tag in `traceability.md` §1: `[API]` → supertest, `[UNIT]` and schema rules → shared package, `[UI]` → component or e2e, `[CONTENT]` → component test of the page text, `[DB]` → constraint test, `[TX]` → fault injection (§4).

**Coverage of the requirement** is measured per scenario, not per line. `/check-story US-xx` produces the table.

## 3. API tests with a real database

- **Database.** A SQLite file `apps/api/data/test.db` (git-ignored), selected by `DATABASE_URL` in `apps/api/vitest.config.ts`.
- **Schema.** `tests/setup/global-setup.ts` deletes the file and runs `prisma migrate deploy` once before all API tests. The committed migrations are used, so the CHECK constraints and partial indexes are the real ones.
- **Isolation.** `resetDb()` (in `tests/helpers/db.ts`) empties every table. Call it in `beforeEach` of any test that touches the database. It is generic: it reads the table list from `sqlite_master`, so a new table needs no change.
- **Serial files.** All test files share one SQLite file, so `fileParallelism` is `false` in the vitest config. Tests inside a file also run in order. The cost is small: the whole API suite runs in about three seconds.
- **Setup data.** `tests/helpers/factories.ts` creates minimal valid rows (`createUser`, `createTask`, `createApplication`). Prefer a factory over repeating `prisma.*.create` in the test. Once login exists, use the real API for setup where the setup *is* part of the journey.
- **The app.** `api()` from `tests/helpers/app.ts` returns a supertest agent on a fresh app. No port is opened.
- **No mocks for the database, the validation or the policies.** Mocks are only for the three ports (`PaymentProvider`, `Mailer`, `FileStorage`), which have simulated or in-memory implementations.

## 4. Testing the race conditions from ADR-0007

ADR-0007 says every invariant is enforced by the database, so the tests attack the invariant, not the code path.

1. **Parallel requests.** Fire the same action several times at once and assert that exactly one succeeds:

   ```ts
   const results = await Promise.all([assign(a), assign(b), assign(a), assign(b)]);
   expect(results.filter((r) => r.status === 200)).toHaveLength(1);
   expect(results.filter((r) => r.body.error?.code === 'TASK_ALREADY_ASSIGNED')).toHaveLength(3);
   ```

   Then assert the **state**: one executor, one `accepted` application, the others `rejected`, one escrow, one `hold` ledger entry.
2. **Which races to cover**, one test each: two assignments of one task (US-25 sc.2); the same reservation twice with the same `Idempotency-Key` (US-26 sc.3); accept twice (US-31 sc.3, US-34 sc.3, one `payout` row); accept and return at the same moment; two withdrawals that together exceed the balance (US-36 sc.3); two moderators deciding one item (INV-24).
3. **Constraint tests** prove the last line of defence: insert the duplicate directly and expect the unique or CHECK error (`schema-constraints.test.ts`). These pass even if the service code is wrong.
4. **Rollback tests (fault injection).** For atomic actions (US-21 sc.2, US-30 sc.2, US-34 sc.2), make one step inside the transaction fail and assert that *nothing* changed: no status change, no notification, no ledger entry, and the answer is 500 `INTERNAL_ERROR`. This is the only place where a test may replace a function. Use `vi.spyOn(…).mockRejectedValueOnce(…)` on the module's `repo` function for the last step.
5. **Money invariant.** After any money test, assert `INV-20`: each balance equals the sum of its ledger entries. `pnpm check:invariants` (to be added with the payments module) runs the same check on a database.
6. **Honest limit.** SQLite with `connection_limit=1` serialises writers, so these tests prove that the *logic* has no check-then-act gap. They do not prove behaviour under real parallel writers (that would matter on Postgres, where the same tests are run against it).

The reference test today is `apps/api/tests/concurrency-adr0007.test.ts`. When the real `assign` service exists, its race test replaces it.

## 5. End-to-end rules

- **One spec per journey**, named after it (`e2e/registration-verification.spec.ts`, `e2e/order-to-payout.spec.ts`). A journey crosses several stories and follows the user journey in `requirements.md` §1. Maximum about eight specs.
- **Seed through the API**, not through the UI. A spec gets its customer, student and task by calling the real endpoints with Playwright's `request` fixture (`register`, `login`, `POST /api/tasks`, moderator `publish`). Only the step under test is driven through the browser. Use unique emails (for example with a timestamp) so specs do not depend on a reset.
- **Locate by role and label**: `getByRole('button', { name: 'Відгукнутися' })`, `getByLabel`, `getByRole('heading')`. Never by CSS class or test id unless there is no accessible name. If a role locator is hard to write, the markup is wrong: fix the markup (see `.claude/rules/web.md`).
- **No sleeps.** No `waitForTimeout`. Use `expect(...).toBeVisible()` and other web-first assertions, which wait and retry. For polling features (chat, notifications), assert with `expect.poll` or `toHaveText` with a timeout.
- **Own database and ports.** The config starts the API on 3101 and the web app on 5174 with `apps/api/data/e2e.db`, so e2e never touches development data.
- **Chromium only.**
- **Every journey step is asserted twice at most**: once in the UI and, if it changes money or status, once through the API.

## 6. What we deliberately do not test

- Express, Prisma, Zod, React and React Router themselves, and the Vite proxy beyond the smoke test.
- Visual design: pixels, colours, spacing, screenshots. The mobile scenarios ("no horizontal scroll", "readable") get one component or Playwright check at a narrow viewport, not a visual diff.
- Other browsers than Chromium, and real mobile devices.
- Performance and load. The system is a demo on one SQLite file.
- Real email delivery and real payments: both sit behind ports with simulated implementations (ADR-0006, ADR-0007). We test our side of the port.
- Static wording of the landing and info pages beyond the content checks in `traceability.md` (US-01 to US-05).
- The `dev` outbox page.
- Every combination of invalid inputs. One test per documented scenario plus the boundary values in `domain-model.md` §1.
- Scenarios that cannot be tested by code (US-41 sc.3) are covered by a review item, not by a test.

## 7. Commands

| Command | What it runs |
|---|---|
| `pnpm test` | All unit, API and component tests (`pnpm -r test`) |
| `pnpm --filter @ctoc/shared test` | Shared package only |
| `pnpm --filter @ctoc/api test` | API tests (creates `data/test.db` first) |
| `pnpm --filter @ctoc/web test` | Component tests |
| `pnpm --filter @ctoc/api exec vitest run -t "US-18"` | Only the tests of one story |
| `pnpm test:e2e` | Playwright (starts both dev servers). First time: `pnpm exec playwright install chromium` |
| `pnpm typecheck` | Types in all packages and in `e2e/` |

## 8. Tests in the definition of done

A story is not done until:

1. **Every Gherkin scenario of the story has a test** named `US-xx sc.N …`, at the level given in `traceability.md`. `/check-story US-xx` shows no row marked *not covered*.
2. Scenarios marked ⚠ have a test for the **decided** behaviour, and the conflict is named in a comment and in `traceability.md` §4.
3. If the story touches a money or counter invariant, there is a test named after the invariant (`INV-xx`), including the parallel case from §4.
4. Tests assert the contract, with no mocked database and no skipped or `.only` tests.
5. If the story changes a journey step, the matching e2e spec is added or updated.
6. `pnpm typecheck`, `pnpm test` (and `pnpm test:e2e` when an e2e spec changed) are green.
7. The status row in `traceability.md` §5 lists the code and the test files.
