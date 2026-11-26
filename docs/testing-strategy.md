# CtoC: Testing Strategy (summary)

Short version for the team. The full rules (race tests, rollback tests, e2e rules, definition of done) are in [`architecture/testing.md`](architecture/testing.md); the scenario-to-level matrix is in [`architecture/traceability.md`](architecture/traceability.md).

## 1. Scope: automated vs. manual

**Automated** (every Gherkin scenario of US-01…US-50 has a test named `US-xx sc.N …`):

| Area | What is covered | Where |
|---|---|---|
| Validation rules | Registration, login, profile, task, application, upload and withdrawal limits and enums; money rounding in kopecks | `packages/shared/tests` |
| Business rules | Task and application state machines, access (401/403/404 per ADR-0006), role checks, error `code` and body shape from `api.md` §3 | `apps/api/tests/<module>` |
| Money and atomic actions | Reserve, accept, payout, withdrawal: one transaction, a ledger entry per balance change, idempotency key, parallel requests (exactly one wins), rollback when a step fails (ADR-0007, INV-20) | `apps/api/tests/concurrency-adr0007.test.ts`, `payments/`, `delivery/` |
| Database limits | CHECK constraints and partial unique indexes from the migration SQL | `apps/api/tests/schema-constraints.test.ts` |
| Notifications | Written in the same transaction as the business change (INV-23) | `apps/api/tests/notifications` |
| UI behaviour | Pages render by route, forms show the message for each error code, guards redirect, logout, empty and error states | `apps/web/tests` |
| Journeys | Smoke, moderation, payout and experience record, finance on a narrow viewport | `e2e/*.spec.ts` |
| Docs in sync | Routes vs `overview.md` §4, error codes vs `api.md`, limits vs docs | `*docs-sync*.test.ts`, `routes-config-docs-sync.test.ts` |

**Manual only** (checked by the author before the PR and in the demo rehearsal):
- Visual design: colours, spacing, typography, alignment, CSS details, animations.
- Responsive look beyond the one narrow-viewport Playwright check ("no horizontal scroll"); real phones.
- Browsers other than Chromium.
- Real email, real payments and real file storage (simulated behind the ports `Mailer`, `PaymentProvider`, `FileStorage`).
- Performance and load (the demo runs on one SQLite file).
- Scenarios that code cannot check (US-41 sc.3): a review item.

## 2. Tools and levels

| Level | Tool | Why this one | Share |
|---|---|---|---|
| Unit | **Vitest** | One runner for the whole TypeScript monorepo; ESM and TS work without extra config; the web app reuses its Vite config | ~35% |
| API integration | **Vitest + Supertest** with a real SQLite database via Prisma | The rules live on the server and in the database, so we call real routes without opening a port and never mock Prisma, validation or policies | ~50% |
| Component | **Vitest + jsdom + Testing Library** | Queries by role and label match the accessible-markup rule in `.claude/rules/web.md` | ~10% |
| End-to-end | **Playwright** (Chromium only) | Proves the pieces are wired together; one spec per journey, about eight at most | ~5% |

`pnpm typecheck` (all packages and `e2e/`) is part of "green".

**Commands**
- Whole suite, one line: `pnpm typecheck && pnpm test && pnpm test:e2e`
- Everything except the browser: `pnpm test` (runs `shared`, `api` and `web` through `pnpm -r test`)
- One story: `pnpm --filter @ctoc/api exec vitest run -t "US-18"` (use `@ctoc/web` or `@ctoc/shared` for the other packages)
- First e2e run: `pnpm exec playwright install chromium`

## 3. Organization and data isolation

**Layout and naming**
```
packages/shared/tests/<topic>.test.ts        # schemas, limits, money
apps/api/tests/<module>/<feature>.test.ts    # identity, tasks, applications, payments, delivery, ...
apps/api/tests/{helpers,setup}/              # app.ts, db.ts, factories.ts, global-setup.ts (not tests)
apps/web/tests/<page-or-feature>.test.tsx    # one file per page or feature; setup.ts
e2e/<journey>.spec.ts, e2e/support/          # Playwright journeys and seed helpers
```
- Test names: `US-xx sc.N <expected behaviour>` (two stories: `US-32 sc.3, US-33 sc.2: …`). Infrastructure tests are named after the document section (`api.md §3 …`, `data-model.md §2 INV-09 …`). e2e tests: `Journey <name>: …`.
- Files end in `.test.ts(x)`; e2e files in `.spec.ts`. No `.only`, no `.skip`.
- A test asserts the contract (status, error `code`, body shape, resulting state), not which function was called.

**Database and state**
- API tests use their own file `apps/api/data/test.db` (`DATABASE_URL` in `apps/api/vitest.config.ts`, git-ignored). `tests/setup/global-setup.ts` deletes it and runs `prisma migrate deploy` once, so the real CHECKs and indexes are present.
- `resetDb()` empties every table (the list is read from `sqlite_master`); call it in `beforeEach`. Test files run one after another (`fileParallelism: false`) because they share one SQLite file.
- Data comes from factories (`createUser`, `createTask`, `createApplication`) or from the real API when the setup is part of the journey. Each test builds its own rows and never relies on another test's data.
- `api()` returns a Supertest agent on a fresh app: no port, no shared server state. Uploads go to `apps/api/data/test-uploads`, emptied before use.
- Time-dependent logic (deadlines, token and session expiry, rate limits) is driven through the data or fake timers, never by real waiting.

**What is really replaced (checked in the test files)**
- **Database: not mocked.** API tests run on the real SQLite file with the real migrations (see above). Only `prisma` access from tests goes through `tests/helpers/db.ts`.
- **`PaymentProvider`: not mocked.** Tests use the real sandbox implementation (`modules/payments/sandbox-provider.ts`) on the real ledger tables; failure is injected with a spy instead (below).
- **`Mailer`: the default in-memory implementation.** In `NODE_ENV=test` `consoleMailer` stores messages in an outbox and does not print. Tests read it with `getOutbox()` and empty it with `clearOutbox()` (`identity/confirm-email.test.ts`, `register.test.ts`). Only `admin/verifications.test.ts` swaps it with `setMailer({ send })` to make delivery fail, and restores the previous one afterwards.
- **`FileStorage`: the real local-disk implementation** writing to `UPLOAD_DIR=data/test-uploads` (set in `vitest.config.ts`). Files that use uploads `rmSync` that directory before each test. `setFileStorage({ ...real, … })` wraps the real storage to simulate a failing delete or a racing upload (`delivery/result-upload.test.ts`, `delete-result-file.test.ts`) and is reset with `setFileStorage(undefined)` in `afterEach`.
- **Injected failures:** `vi.spyOn(repo, 'fn').mockRejectedValueOnce(new Error(…))` on a repository function (for example `notificationsRepo.insertNotification` in `admin/mod-tasks.test.ts`) to prove rollback; `console.error` is silenced the same way. `fileParallelism: false` keeps spies from leaking between files.
- **Time:** `vi.useFakeTimers({ shouldAdvanceTime: true })` only in `web/tests/chat.test.tsx` (polling). API tests set dates through the data, not clocks.
- **Web: `fetch` is stubbed per test** with `vi.stubGlobal('fetch', vi.fn(async (url, init) => …))`, answering by URL and method with `json(...)` responses (for example `apply.test.tsx`); `afterEach(() => vi.unstubAllGlobals())` restores it (used in 33 test files). There is no MSW. Pages are rendered with `createTestRouter([...])` inside `RouterProvider`; `Layout` creates its own `QueryClient` for each mount, so cache and session are fresh in every test, and `tests/setup.ts` runs Testing Library `cleanup()` after each test (plus a `Request` shim for jsdom).
- **Shared package:** pure functions, nothing to replace.

**e2e isolation**
- Own ports (API 3101, web 5174) and own database `apps/api/data/e2e.db` (`playwright.config.ts`); the API's `dev` script applies the migrations at start. The file is **not deleted** between runs.
- One worker, no parallelism. Accounts and sessions are written straight into `e2e.db` with `userWithSession` (`e2e/support/finance-seed.ts`, its own `PrismaClient`); the moderator's decisions and task creation go through the real API (`e2e/support/moderation-api.ts`). Emails are unique per run (timestamp plus random suffix), so specs need no reset and old rows do no harm.
- No network stubbing: the browser talks to the real API; email and payments are the same local implementations as above.
- Locators by role and label; no `waitForTimeout`, only web-first assertions.
