# CtoC: Traceability Matrix

Maps every story **US-01…US-42** and each of its three Gherkin scenarios to the endpoint, page, entities and response code that implement it, then proposes an implementation order and lists the weak spots.

**Sources.** The stories and scenarios are in `docs/requirements.md` §4 (126 scenarios, 3 per story). There are no `docs/US-*.md` files. The design is in [`overview.md`](overview.md), [`api.md`](api.md), [`domain-model.md`](domain-model.md) and [`data-model.md`](data-model.md). Digest ids (`OQ-`, `A-`, `C-`, `G-`) refer to [`requirements-digest.md`](../analysis/requirements-digest.md) and to the open questions in `overview.md` §7.

## How to read the matrix

- **Scenarios column.** `S1` is Scenario 1 (Happy Path), `S2` is Edge Case 1, `S3` is Edge Case 2. Each entry reads `S# [test level] → outcome / HTTP code`.
- **Test levels:**
  - `[API]` HTTP test against the running API.
  - `[UI]` browser test (Playwright or component test).
  - `[CONTENT]` static page content check.
  - `[DB]` schema or storage test.
  - `[TX]` fault injection inside a transaction.
  - `[UNIT]` pure-function test (money, state machines).
  - `[DESIGN]` not testable by code, needs a review or audit.
- **Page access codes** are the same as in `overview.md` §4. `(NEW)` marks an endpoint that is **not yet in `api.md`** and must be added (see §4, W-09).
- A scenario marked **⚠** conflicts with the requirements or with the design. The conflict is named in §4 and is not resolved silently.

---

## 1. Matrix

### Epic 1: Introduction to the platform

| Story | Endpoints | Pages | Entities | Scenarios → code |
|---|---|---|---|---|
| US-01 | none (static) | `/` | none | S1 [CONTENT] page shows the beginners-only block → 200 · S2 [CONTENT] the heading about agencies and seniors is in the first screen · S3 [UI] at 390 px width the block is visible without deep scrolling |
| US-02 | none (static) | `/` | none | S1 [CONTENT] 3–4 steps → 200 · S2 ⚠ [CONTENT] OQ-16: content is static, so the test asserts "3 or 4 steps" at build time · S3 ⚠ [CONTENT] every step has non-empty text |
| US-03 | `GET /api/public/settings`, `PUT /api/mod/settings` | `/`, `/terms`, `/mod/settings` | Settings | S1 [API] commission returned without login → 200 · S2 [CONTENT] commission text present on `/` or `/terms`, otherwise the check fails · S3 [API] after `PUT` the next `GET` shows the new value with `Cache-Control: no-store` → 200 |
| US-04 | none (static) | `/payment-safety` | none | S1 [CONTENT] reservation and payout process described → 200 · S2 [CONTENT] page mentions reservation by the customer · S3 [UI] mobile: no horizontal scroll |
| US-05 | none (static) | `/resume-info` | none (static example) | S1 [CONTENT] explains the automatic verified record → 200 · S2 [CONTENT] text contains no claim that users add projects themselves · S3 [CONTENT] a visual example of the record is present |

### Epic 2: Registration, student verification, profile

| Story | Endpoints | Pages | Entities | Scenarios → code |
|---|---|---|---|---|
| US-06 | `POST /api/auth/register` | `/register` | User, EmailToken, UniversityDomain | S1 [API] university email → **201**, account unconfirmed, email in `/api/dev/outbox` · S2 [API] `test@gmail.com` → **400** `EMAIL_DOMAIN_NOT_ALLOWED` · S3 [API] repeated email → **409** `EMAIL_TAKEN` |
| US-07 | `POST /api/auth/confirm-email`, `POST /api/auth/resend-confirmation` | `/confirm-email`, `/login` | EmailToken, User | S1 [API] valid token → **200**, `emailConfirmedAt` set, UI redirects to the success page · S2 [API] token older than 24 h → **400** `TOKEN_EXPIRED`, UI offers resend · S3 [API] resend → **202**, new token, older tokens invalidated |
| US-08 | `POST /api/me/verification`, `GET /api/me/verification` | `/me/verification` | VerificationRequest, File | S1 [API] JPG/PNG/PDF → **201**, status `pending` («Очікує перевірки»), the user does not get the role · S2 [API] `.exe` or `.zip` → **400** `FILE_TYPE_NOT_ALLOWED` · S3 [API] over 10 MB → **400** `FILE_TOO_LARGE` |
| US-09 | `GET /api/profiles/:userId` (trigger: `POST /api/mod/verifications/:id/approve`) | `/u/:userId`, `/me/profile` | User (`studentVerifiedAt`) | S1 [API] after approval the profile has `verified: true` → **200** · S2 [API] unverified or pending user has `verified: false` · S3 [UI+DB] the flag comes from the database, so it survives a reload and a new login |
| US-10 | `PUT /api/me/skills`, `GET /api/skills` | `/me/profile`, `/u/:userId` | Skill, ProfileSkill | S1 [API] skills saved and shown on the public profile → **200** · S2 [API] empty skill → **400** `SKILL_EMPTY` · S3 [API] 21st skill → **400** `SKILLS_LIMIT` |
| US-11 | `PUT /api/me/profile` | `/me/profile`, `/u/:userId` | StudentProfile | S1 [API] bio ≤ 500 characters → **200** · S2 [API] bio over 500 → **400** `BIO_TOO_LONG` · S3 [DB] emoji round-trips unchanged (UTF-8) |

### Epic 3: Finding a task

| Story | Endpoints | Pages | Entities | Scenarios → code |
|---|---|---|---|---|
| US-12 | `GET /api/tasks` | `/feed` | Task | S1 [API] verified student → **200** list with description, price and deadline · S2 ⚠ [DB] a task without a deadline **cannot exist** (`NOT NULL`), so the test asserts the insert fails · S3 [API] no session → **401** `AUTH_REQUIRED`, UI redirects to `/login` |
| US-13 | `GET /api/tasks`, `GET /api/tasks/:id`, `POST /api/tasks/:id/applications` | `/feed`, `/tasks/:id` | Task, Application | S1 [UI] shows 500 UAH and no price input · S2 ⚠ [API] forged `priceKopecks` is **stripped** → **201**, the application has no price (W-05) · S3 [UI] no «Зробити ставку» button or price field |
| US-14 | `GET /api/tasks`, `GET /api/tasks/:id`, `POST /api/mod/tasks/:id/publish`, `…/reject` | `/feed`, `/mod/tasks` | Task | S1 [API] published task is in the feed → **200** · S2 [API] `pending_moderation` task is absent from the feed, and `GET /:id` by a non-owner → **404** `NOT_FOUND` · S3 [API] rejected task never appears in the feed |
| US-15 | `GET /api/tasks`, `GET /api/tasks/:id` (fields `commissionKopecks`, `netKopecks`), `POST /api/tasks` | `/feed`, `/tasks/:id` | Task, Settings | S1 [API] 100000 gross at 10% → net **90000** · S2 ⚠ [API] price 0 → **400** `PRICE_BELOW_MIN` already at creation (W-04) · S3 [UI] mobile: net amount readable, not merged with the gross amount |
| US-16 | `POST /api/tasks` | `/c/tasks/new` | Task | S1 [API] valid form → **201**, status `pending_moderation` · S2 [API] empty description → **400** `VALIDATION_FAILED` with `details` for the field · S3 [API] 1-character title → **400** `TITLE_TOO_SHORT` |
| US-17 | `POST /api/tasks` | `/c/tasks/new` | Task, Settings | S1 [API] price 40000 kopecks → **201**, price stored · S2 [API] 2000 kopecks → **400** `PRICE_BELOW_MIN` · S3 [API] non-numeric price → **400** `VALIDATION_FAILED` (the UI field is also `type=number`) |

### Epic 4: Applying and starting work

| Story | Endpoints | Pages | Entities | Scenarios → code |
|---|---|---|---|---|
| US-18 | `POST /api/tasks/:id/applications` | `/tasks/:id` | Application | S1 [API] verified student → **201**, status `sent` · S2 [API] second application → **409** `ALREADY_APPLIED` (button disabled in the UI) · S3 ⚠ [API] non-verified student → **403** `STUDENT_NOT_VERIFIED` (W-02) |
| US-19 | `POST /api/tasks/:id/applications` | apply dialog on `/tasks/:id` | Application (`note`) | S1 [API] note saved → **201** · S2 [API] note over 500 → **400** `NOTE_TOO_LONG` · S3 [API] no note → **201**, `note` is null |
| US-20 | `GET /api/me/applications`, `POST /api/tasks/:id/applications/:appId/reject` | `/me/applications` | Application | S1 [API] status «Надіслано» → **200** · S2 [API] after the customer assigns, the status is «Прийнято» · S3 [API] after another applicant is chosen or the customer rejects it, the status is «Відхилено» (W-20) |
| US-21 | `POST /api/tasks/:id/assign` (trigger), `GET /api/me/notifications`, `POST /api/me/notifications/:id/read` | `/notifications` | Notification, Application | S1 [API] notification «Вас обрано виконавцем завдання [Назва]» created in the same transaction · S2 ⚠ [TX] injected failure → **5xx**, no notification, applications stay `sent` (W-08) · S3 [API] unread notification still listed later |
| US-22 | `GET /api/tasks/:id`, `GET /api/me/work` (NEW), `DELETE /api/tasks/:id` | `/me/work`, `/work/:taskId` | Task | S1 [API] executor gets terms, deadline and price → **200** (list needs `GET /api/me/work`, W-09) · S2 [API] delete after assignment → **409** `TASK_HAS_EXECUTOR` · S3 [UI] deadline shown in the browser's local time zone |
| US-23 | `GET /api/tasks/:id/messages?after=`, `POST /api/tasks/:id/messages` | `/work/:taskId`, `/c/tasks/:id` | Message | S1 [API] **201**, the counterpart sees it on the next poll (W-18) · S2 [API] empty text → **400** `MESSAGE_EMPTY` · S3 [API] outsider → **403** `NOT_CHAT_PARTICIPANT` |
| US-24 | `GET /api/tasks/:id/applications`, `GET /api/profiles/:userId` | `/c/tasks/:id`, `/u/:userId` | Application, StudentProfile, User | S1 [API] owner → **200** list with skills, bio, verified flag · S2 ⚠ [DB] an unverified applicant cannot exist (W-01). The test clears `studentVerifiedAt` after applying and asserts the badge disappears · S3 [UI] mobile profile opens full screen |
| US-25 | `POST /api/tasks/:id/assign` | `/c/tasks/:id` | Task, Application, Escrow | S1 [API] **200**, chosen application `accepted`, the rest `rejected` · S2 [API] second assignment → **409** `TASK_ALREADY_ASSIGNED` (buttons disabled in the UI) · S3 ⚠ [API] no funds → **422** `INSUFFICIENT_FUNDS`. The design reserves inside the assign call (W-03) |
| US-26 | `POST /api/tasks/:id/assign` (with `Idempotency-Key`), `POST /api/me/balance/sandbox-topup`, `GET /api/me/balance` | `/c/tasks/:id`, `/c/balance` | Escrow, Balance, LedgerEntry | S1 [API] **200**, escrow `held` for the full price · S2 [API] balance below price → **422** `INSUFFICIENT_FUNDS`, nothing changed · S3 [API] the same key again → the same 200 and one hold. Without a key → **409** `TASK_ALREADY_ASSIGNED`, no second charge |

### Epic 5: Delivering and accepting the result

| Story | Endpoints | Pages | Entities | Scenarios → code |
|---|---|---|---|---|
| US-27 | `POST /api/tasks/:id/result/files`, `GET /api/files/:fileId` | `/work/:taskId` | ResultVersion, ResultFile, File | S1 [API] **201**, file linked to the open version · S2 [API] `.bat` or `.scr` → **400** `FILE_TYPE_NOT_ALLOWED` · S3 [API] over 50 MB → **400** `FILE_TOO_LARGE` |
| US-28 | `POST /api/tasks/:id/result/submit` | `/work/:taskId` | ResultVersion, Task | S1 [API] **200**, task `in_review` · S2 [API] no files → **409** `NO_RESULT_FILES` · S3 [API] already in review → **409** `ALREADY_IN_REVIEW` |
| US-29 | `GET /api/me/work` (NEW), `GET /api/tasks/:id`, `DELETE /api/tasks/:id/result/files/:fileId` | `/me/work`, `/work/:taskId` | Task, ResultVersion | S1 [API] list shows «На перевірці» → **200** (needs W-09) · S2 [UI] status survives a reload (server state) · S3 [API] delete or upload while in review → **409** `RESULT_LOCKED` |
| US-30 | `POST /api/tasks/:id/accept` (trigger), `GET /api/me/notifications` | `/notifications` | Notification | S1 [API] «Ваш результат прийнято замовником! Оплату нараховано» created in the accept transaction · S2 ⚠ [TX] injected failure → **5xx**, status unchanged, no notification (W-08) · S3 [API] unread notification listed later |
| US-31 | `POST /api/tasks/:id/accept` | `/c/tasks/:id` | Task, Escrow, LedgerEntry, Balance, ExperienceRecord, Notification | S1 [API] **200**, task `done`, escrow `released` · S2 [API] non-owner → **403** `NOT_TASK_OWNER` · S3 [API] already done → **409** `TASK_ALREADY_DONE` |
| US-32 | `POST /api/tasks/:id/return` | `/c/tasks/:id` | Task, ResultVersion | S1 [API] **200**, task `revision`, student may upload a new version · S2 [API] return after `done` → **409** `TASK_ALREADY_DONE` · S3 [API] no comment → **400** `COMMENT_REQUIRED` (same rule as US-33/S2, W-16) |
| US-33 | `POST /api/tasks/:id/return` | `/c/tasks/:id`, `/work/:taskId` | ResultVersion (`revisionComment`), Notification | S1 [API] **200**, comment visible to the student · S2 [API] empty → **400** `COMMENT_REQUIRED` · S3 [API] over 2000 characters → **400** `COMMENT_TOO_LONG` |

### Epic 6: Payment and verified experience

| Story | Endpoints | Pages | Entities | Scenarios → code |
|---|---|---|---|---|
| US-34 | `POST /api/tasks/:id/accept`, `GET /api/me/balance` | `/me/finance` | Balance, LedgerEntry, Escrow | S1 [API] student balance +90000, available to withdraw · S2 ⚠ [TX] injected provider error → no credit, escrow stays `held`, error logged (W-06) · S3 ⚠ [API] repeated accept → **409** `TASK_ALREADY_DONE`, exactly one `payout` row (W-06) |
| US-35 | `GET /api/me/finance` | `/me/finance` | LedgerEntry, Task | S1 [API] 1000 / 100 / 900 → **200** · S2 [UNIT] odd-kopeck prices round half-up and `gross = commission + net` · S3 [UI] mobile: all three values visible |
| US-36 | `POST /api/me/withdrawals`, `GET /api/me/withdrawals`, `POST /api/mod/withdrawals/:id/mark-paid` | `/me/finance`, `/mod/withdrawals` | Withdrawal, Balance, LedgerEntry | S1 [API] valid card, enough balance → **201** · S2 ⚠ [API] bad number → **400** `CARD_INVALID` (format and Luhn only, W-13) · S3 [API] 500 UAH from a 300 UAH balance → **422** `INSUFFICIENT_BALANCE` |
| US-37 | `POST /api/tasks/:id/accept` (creates), `GET /api/profiles/:userId`, `POST /api/mod/tasks/:id/resolve` | `/u/:userId` | ExperienceRecord | S1 [API] record with title, description and date appears · S2 ⚠ [API] a moderator refund moves the task to `cancelled` and no record exists (W-07) · S3 [API] records ordered newest first |
| US-38 | `GET /api/profiles/:userId`; **no write endpoint** | `/u/:userId` | ExperienceRecord | S1 [API] each record carries «Підтверджено платформою CtoC» · S2 [API] `POST`/`PUT /api/me/experience` → **404** (route does not exist) · S3 [API] after `PUT /api/me/skills` and `/profile` the records are unchanged |

### Epic 7: Platform boundaries and trust

| Story | Endpoints | Pages | Entities | Scenarios → code |
|---|---|---|---|---|
| US-39 | `GET /api/mod/verifications`, `POST …/:id/approve`, `POST …/:id/reject` | `/mod/verifications` | VerificationRequest, User, Notification | S1 [API] approve → **200**, user becomes verified · S2 [API] reject with reason → **200**, notification to the user. Without a reason → **400** `REASON_REQUIRED` · S3 [API] a student calls the endpoint → **403** `ROLE_FORBIDDEN` |
| US-40 | `GET /api/mod/tasks`, `POST …/:id/publish`, `POST …/:id/reject`, `POST /api/tasks` | `/mod/tasks` | Task | S1 [API] publish → **200**, status `published` · S2 [API] reject with reason → **200**, never in the feed · S3 [API] `POST /api/tasks` with `status: "published"` → the field is stripped, **201**, status `pending_moderation` |
| US-41 | none of its own (policies on applications and `/api/mod/verifications/*`) | `/mod/verifications` | VerificationRequest | S1 [API] only verified students can apply (see US-18/S3) · S2 [API] a forged document is rejected through the US-39/S2 path · S3 ⚠ [DESIGN] "technical rules make commercial contractors impossible" cannot be tested by code (W-12) |
| US-42 | `POST /api/tasks/:id/applications` | `/tasks/:id` | Application | S1 [UI] the apply form has no price or budget field · S2 [API] body with a lower `priceKopecks` → ignored, **201**, task price unchanged · S3 [UI] no auction or competition-by-price elements |

---

## 2. Scenario coverage summary

All **126 scenarios** (42 stories × 3) are mapped. Counted from the matrix above:

| Test level | Scenarios | Note |
|---|---|---|
| `[API]` | 95 | Includes the 403, 409 and 422 cases. The main automated suite. |
| `[UI]` | 12 | Mobile layout, absent price or auction controls, local time zone |
| `[CONTENT]` | 11 | Static public pages (US-01 to US-05) |
| `[DB]` | 4 | Schema limits and encoding. One scenario (US-09/S3) is both `[UI]` and `[DB]`. |
| `[TX]` | 3 | Fault injection inside a transaction (US-21/S2, US-30/S2, US-34/S2) |
| `[UNIT]` | 1 | Money rounding (US-35/S2) |
| `[DESIGN]` | 1 | Not testable by code (US-41/S3) |

**15 scenarios are marked ⚠** because they conflict with the requirements or the design, or cannot be implemented as worded: US-02/S2, US-02/S3, US-12/S2, US-13/S2, US-15/S2, US-18/S3, US-21/S2, US-24/S2, US-25/S3, US-30/S2, US-34/S2, US-34/S3, US-36/S2, US-37/S2, US-41/S3. Each has an entry in §4.


Endpoints in `api.md` that **no story covers directly**. Each exists to support a story or an assumption:

| Endpoint | Why it exists | Related |
|---|---|---|
| `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/me` | No login story | OQ-11 |
| `GET /api/my/tasks` | Customer "my tasks" list | OQ-07 |
| `POST /api/me/balance/sandbox-topup` | Customer funding for US-26 | OQ-09, A-06 |
| `POST /api/mod/users/:id/revoke-student` | Revoking student status | A-18 |
| `POST /api/mod/tasks/:id/resolve` | Manual deal resolution | OQ-08, A-09 |
| `GET /api/mod/withdrawals`, `…/mark-paid`, `…/reject` | Payout processing | OQ-10, A-10 |
| `GET/POST/DELETE /api/mod/university-domains` | Domain allow-list | A-17, US-06 |
| `GET /api/dev/outbox` | Email links in local mode | ADR-0006 |
| `GET /api/files/:fileId`, `GET /api/skills` | Support endpoints for US-08, US-27, US-31 and US-10 | |

Endpoints **referenced here but missing from `api.md`**: `GET /api/me/work` (see W-09) and an `INTERNAL_ERROR` 500 code (see W-08).

---

## 3. Recommended implementation order

The end-to-end journey comes first, in **two passes**:
- **Pass A** builds only the Happy Path scenario (S1) of each story, in journey order, so that steps 1 to 7 of the user journey can be clicked through as early as possible.
- **Pass B** adds the edge scenarios (S2, S3) and hardening.

This follows the risk register: M-01 (scope) and M-05 (late integration).

| Step | When | Stories | Why here | Done when |
|---|---|---|---|---|
| **0. Walking skeleton** | Week 1 | US-06, US-07 plus login and logout (OQ-11) | It forces every layer to exist: shared schemas, the DB, the error format, sessions, the Vite shell, route guards, CI and the seed with a moderator | A browser registers, confirms through the outbox page, logs in, and `GET /api/me` works |
| **1. Verified student** | Week 1–2 | US-08, US-39 (S1), US-09 | Nothing else works for students without it | A seeded moderator approves a document and the badge shows |
| **2. Tasks and feed** | Week 2 | US-03 (settings and commission), US-16, US-17, US-40 (S1), US-14, US-12, US-13, US-15 | Commission must exist before net price (US-15). Moderation gates the feed. | A customer posts, a moderator publishes, a student sees gross and net |
| **3. Apply, select, reserve** | Week 2–3 | US-18, US-24, US-25, US-26 (with sandbox top-up), US-21 | The riskiest transaction (ADR-0007). Builds the notification mechanism. | One click assigns an executor and holds funds, and the student gets a notification |
| **4. Work, accept, pay** | Week 3 | US-22, US-27, US-28, US-31, US-34, US-37, US-38, US-30 (+ `GET /api/me/work`) | Completes journey step 7 | The journey from registration to the verified experience record runs in the browser. **Demo checkpoint.** |
| **5. Remaining S1 scenarios** | Week 3–4 | US-10, US-11, US-19, US-20, US-23 (chat), US-29, US-32, US-33, US-35, US-36 (+ `/mod/withdrawals`) | Fills the journey without changing its shape | Every story has its S1 working |
| **6. Public pages (parallel filler)** | From week 1, by the frontend developer | US-01, US-02, US-03 (page), US-04, US-05 | Static, no backend dependency. A good task while the backend slices are in progress. | Pages exist and pass the content checks |
| **7. Pass B: edge scenarios and hardening** | Week 4 | All S2 and S3 in §1. First the authorization matrix (every endpoint × role), the concurrency tests and `npm run check:invariants`. Then upload checks, then US-41 and US-42. | Cheap once the slices exist, and the money and permission rules need most attention | Tests named after INV-xx and every scenario in §1 are green |
| **8. Demo preparation** | Week 5 | Seed, scripted walkthrough, hosting time-box, cut list | | A local demo from a clean clone, with a rehearsed script |

**Cut list if behind** (agreed earlier, risk M-01), cut in this order:
1. US-05 visual example (S3).
2. US-35 polish (S2 and S3 beyond the basic breakdown).
3. US-37 S3 (sorting).
4. The mobile-layout scenarios: US-01/S3, US-04/S3, US-15/S3, US-24/S3, US-35/S3.
5. US-02/S2 and S3.

---

## 4. Weakly covered, assumption-dependent or unclear

Each row says what to do. **None of these is resolved silently.** Where the design proceeds, it uses the interim behaviour stated, and that is a proposal, not a decision.

### 4.1 Contradictions and conflicts (named)

| ID | Stories | Problem | Interim behaviour in the design | What to do |
|---|---|---|---|---|
| W-01 | US-24/S2 vs US-18/S3 | US-24/S2 has a non-verified user who submitted an application. US-18/S3 blocks non-verified students from applying. (OQ-02) | Follows US-18/S3. The scenario is tested only by revoking verification after applying. | Ask the product owner to reword US-24/S2 or to confirm the revocation reading. |
| W-02 | US-12 checklist vs US-18/S3 | The feed is "для верифікованих студентів", yet a non-verified user presses «Відгукнутися» and gets a prompt to verify. With `GET /api/tasks` and `GET /api/tasks/:id` limited to verified students, that button is unreachable in the UI. **New, not in the digest.** Proposed as OQ-19. | `/feed` returns 403 `STUDENT_NOT_VERIFIED`. The apply 403 is tested at API level only. | Cheapest: let any confirmed student read the feed and task details, and block only the application. That also explains why to verify. It needs the product owner's OK because it relaxes the US-12 checklist. |
| W-03 | US-25/S3 vs US-26 | US-25/S3 says the system requires reservation before «Обрати виконавцем». US-26 says "before or during" assignment. (digest C-04) | Reservation happens inside the assign call (A-05). US-25/S3 is tested as 422 `INSUFFICIENT_FUNDS`. | Confirm that "during" is acceptable, then change the US-25/S3 wording. |
| W-04 | US-15/S2 | The scenario says a price of 0 or less is "blocked at the moderation stage". The design rejects it at creation (400, DB `CHECK > 0`), so it never reaches moderation. **New.** | The test asserts 400 `PRICE_BELOW_MIN` at creation. | Confirm the earlier rejection. It is stricter and cheaper. |
| W-05 | US-13/S2 vs US-42/S2 | US-13/S2 says the backend "відхиляє" ("rejects") a forged price. US-42/S2 allows "ігнорує або відхиляє" ("ignores or rejects"). The design strips the field and returns 201. **New, minor.** | Strip, then test that the stored application has no price. | If US-13/S2 must be read literally, switch the schema to strict mode and return 400 `VALIDATION_FAILED` for unknown keys. One line of configuration. |
| W-06 | US-34/S2, S3 | Both assume an external gateway and a webhook. Payments are simulated, so there is no gateway and no webhook. (OQ-12) | S2 is tested by a forced provider error. S3 by calling accept twice. | Reword the scenarios once A-06 is confirmed, or accept the substitute tests. |
| W-07 | US-37/S2 | Refers to a task "cancelled by the customer", but no cancellation story exists. After assignment only a moderator can cancel (A-08). (OQ-08) | Test through the moderator refund. | Add a cancellation story, or reword US-37/S2. |
| W-08 | US-21/S2, US-30/S2 | They need a "server error" outcome, but `api.md` has no 5xx code. **Gap in `api.md`.** | Fault-injection test expects HTTP 500. | Add `INTERNAL_ERROR` (500) to the `api.md` dictionary and a test hook that fails one step of a transaction. |
| W-09 | US-22/S1, US-29/S1 | "Мої активні завдання" and the student's task list have **no endpoint**. `GET /api/my/tasks` is customer-only. **Gap in `api.md`.** | `GET /api/me/work` (NEW) lists the student's tasks as executor. | Add it to `api.md` with access S+. |
| W-10 | US-12/S2 | A task without a deadline cannot exist in the schema (`NOT NULL`). | The test asserts the insert fails. | Keep. No further action. |

### 4.2 Weak or hard-to-test scenarios

| ID | Stories | Problem | What to do |
|---|---|---|---|
| W-11 | US-02/S2, S3 | They describe runtime failure of a dynamic block, but the content is static (A-23, OQ-16). | Replace with a build-time content check. Or drop them. |
| W-12 | US-41/S3 | "technical rules make participation of commercial contractors impossible" is not enforceable by code. It relies on manual moderation (OQ-15). | Keep as a documented review item, not an automated test. |
| W-13 | US-36/S2 | A card from a "закордонного банку" ("foreign bank") cannot be detected without issuer (BIN) data (OQ-13). | Validate 16 digits and Luhn only. Tell the product owner the foreign-bank half is not covered. |
| W-14 | US-08 | The status label is «На перевірці адміністратором» in the checklist but «Очікує перевірки» in S1 (digest C-03). | Use «Очікує перевірки» and update the checklist. |
| W-15 | US-37 | The story title says "обсягом" ("volume"), the checklist says "описом" ("description") (OQ-14). The record also publishes the customer's task description on a public page. | Store title, description and date. Add a note in the terms. Ask whether customers must consent. |
| W-16 | US-32/S3, US-33/S2 | Same rule tested twice: a return without a comment. | One implementation, one test, referenced from both. |
| W-17 | US-01/S2, US-03/S2, US-04/S2, US-05/S2 | Not behaviours. They describe a defect "if content is missing". | Convert to a single content checklist or test. |
| W-18 | US-23/S1 | "миттєво" ("instantly") versus polling every few seconds (digest NFR-22, risk T-09). | Agree a number (for example 5 s) and test against it. |
| W-19 | US-26/S3 | The AC does not say how a "duplicate request" is recognised. | Idempotency key on assign, and 409 `TASK_ALREADY_ASSIGNED` without one. Document it in `api.md` (already there). |
| W-20 | US-20/S3 | "Customer rejected this application" appears only in a scenario precondition. No story or UI. | The endpoint `POST …/reject` exists. Add a one-line story, or remove it. |
| W-21 | US-09/S3, US-29/S2 | Persistence-after-reload scenarios give little value: the data lives in the database. | One generic reload test, not one per story. |

### 4.3 Missing stories that the matrix needs

| ID | Gap | What to do |
|---|---|---|
| W-22 | No customer registration (OQ-04), no login or logout (OQ-11), no display name (OQ-06) | Write three short stories. The design assumes them (ADR-0006) and the walking skeleton cannot finish without them. |
| W-23 | No customer-side notifications and no "my tasks" page (OQ-07) | Write one story. Without it the customer cannot know about applications (US-25) or submitted results (US-31). |
| W-24 | No funding story for the customer balance (OQ-09) and no withdrawal processing story (OQ-10) | Keep the sandbox top-up and the moderator page as labelled placeholders. Write stories if real money is ever in scope. |

### 4.4 Stories that depend on digest assumptions

If the assumption is wrong, these stories change.

| Assumption | Stories affected | Risk if wrong |
|---|---|---|
| A-01 customers sign up with any email | US-16, US-17, US-25, US-26, US-31 (all customer stories) | medium |
| A-02 one role per account | US-18, US-25, US-40 | medium |
| A-05 selection and reservation are one action | US-25, US-26, US-21 | low |
| A-06 simulated payments | US-26, US-34, US-36 | **high** |
| A-07 commission snapshot at publication | US-03/S3, US-15, US-34, US-35 | medium |
| A-08 customer cancels only before an executor | US-22/S2, US-37/S2 | medium |
| A-09 manual dispute resolution | US-31, US-34/S2 | **high** |
| A-10 manual withdrawal processing | US-36 | medium |
| A-11 example values adopted | US-07, US-08, US-10, US-11, US-17, US-27 | low |
| A-13 feed shows only open, future-deadline tasks | US-12, US-14 | low |
| A-15 in-app notifications for all state changes | US-21, US-30 | low |
| A-16 public profiles | US-09, US-24, US-37, US-38 | medium |
| A-17 static domain allow-list | US-06 | medium |
| A-20 chat opens at assignment | US-23 | low |
| A-23 landing content is static | US-01 to US-05 | low |

**Recommended actions, in order:**
1. Get a decision on W-01, W-02, W-03 and A-06, since they change endpoints or access rules.
2. Add `GET /api/me/work` and `INTERNAL_ERROR` to `api.md` (W-08, W-09).
3. Have the product owner reword the scenarios listed under W-04 to W-07, W-14 and W-20.
4. Write the missing stories (W-22 to W-24) or confirm the placeholders.
