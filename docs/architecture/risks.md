# Risk Register

Probability (P) and impact (I) are **low / med / high**. The trigger is how we will notice the risk has fired. "Lives in" says where the risk is handled. Risks marked **ACCEPTED** are consciously taken for the MVP.

Sources: `requirements-digest.md` (G-, A-, NFR-, BR- ids), `docs/adr/`.

## Summary

| ID | Risk | P | I | Accepted |
|---|---|---|---|---|
| T-01 | Native SQLite module fails to install on a teammate's machine | med | med | |
| T-02 | Hosted demo loses data and uploads on redeploy or restart | high | low | ACCEPTED |
| T-03 | Logic race breaks a money or state invariant | med | high | |
| T-04 | Rounding drift between card amount, credit and breakdown | low | high | |
| T-05 | Missing authorization check exposes a chat, file or ID scan | med | high | |
| T-06 | Dangerous file accepted through upload | med | med | |
| T-07 | Hosted service is asleep or slow at the demo | med | med | ACCEPTED |
| T-08 | Confirmation email does not arrive in the hosted demo | med | med | |
| T-09 | Chat polling feels slow or loads the server | low | low | ACCEPTED |
| T-10 | Shared package or workspace setup breaks builds | med | med | |
| T-11 | A second server instance corrupts or splits SQLite data | low | high | |
| P-01 | Reviewers expect real money, not simulated payments | med | high | ACCEPTED |
| P-02 | Empty marketplace during the demo | med | high | |
| P-03 | Escrow stuck: customer never accepts or returns | med | med | ACCEPTED |
| P-04 | Moderation queue becomes the bottleneck | med | med | ACCEPTED |
| P-05 | University domain allow-list rejects a real student | med | med | |
| P-06 | Role assumptions (A-01, A-02) turn out wrong | med | med | |
| P-07 | Privacy or legal objection to storing student IDs and card data | med | high | ACCEPTED (partly) |
| P-08 | Commission changes while tasks are in flight | low | med | |
| P-09 | Homework or a forged student card passes moderation | med | med | ACCEPTED |
| M-01 | 42 stories do not fit into 5 weeks | high | high | |
| M-02 | Skill gap with Drizzle, TanStack Query, Zod | high | med | |
| M-03 | Deployment never works (no DevOps experience) | med | med | |
| M-04 | Six people plus Claude Code produce merge conflicts and inconsistent code | high | med | |
| M-05 | Frontend and backend integrate too late | med | high | |
| M-06 | Only one person understands the money and concurrency code | med | high | |
| M-07 | A team member's role is under-used (AI & Automation) | med | low | |

---

## 1. Technical risks

### T-01 Native SQLite module fails to install
- **P / I:** med / med. `better-sqlite3` needs a prebuilt or compiled native binary, and the team uses different operating systems and Node versions.
- **Trigger:** `npm install` fails for any teammate or in CI. Setup questions in the team chat in week 1.
- **Mitigation:** pin Node in `.nvmrc` and `engines`. Run CI install on Linux and Windows. Week-1 task: every teammate runs a clean clone. Fallback: Node's built-in SQLite module.
- **Lives in:** ADR-0004, ADR-0003.

### T-02 Hosted data lost on redeploy or restart — ACCEPTED
- **P / I:** high / low. Free-tier disks are often ephemeral. The loss only affects demo data.
- **Trigger:** the hosted site shows an empty marketplace after a redeploy.
- **Mitigation:** deterministic seed on an empty database. A scripted demo flow. The authoritative demo runs locally.
- **Lives in:** ADR-0004, ADR-0009.

### T-03 Logic race breaks an invariant
- **P / I:** med / high. Two executors on one task, double escrow, double credit, withdrawal above balance (digest NFR-18).
- **Trigger:** `npm run check:invariants` reports a mismatch between ledger and balances. A concurrency test that fires duplicate requests fails.
- **Mitigation:** unique constraints and conditional `UPDATE`s in one synchronous transaction. Tests that call each action twice, and in parallel through HTTP.
- **Lives in:** ADR-0007; `payments`, `tasks`, `applications` modules.

### T-04 Rounding drift
- **P / I:** low / high. The card shows 900 UAH (US-15), the ledger credits something else, and the breakdown (US-35) does not add up.
- **Trigger:** the test `gross = commission + net` fails, or a seeded task with an odd-kopeck price shows a different amount in two places.
- **Mitigation:** integer kopecks everywhere. One shared `money` helper. The commission rate is snapshotted on the task at publication.
- **Lives in:** ADR-0007; `packages/shared`.

### T-05 Missing authorization check
- **P / I:** med / high. IDOR on chat, result files, ID scans, applications (NFR-07).
- **Trigger:** the endpoint × role test matrix has a gap or a failing row. Any endpoint without a policy call found in review.
- **Mitigation:** a `policy.ts` per module, called from services. A test matrix of every endpoint against every role. Files are served only through authorized endpoints.
- **Lives in:** ADR-0006, ADR-0004.

### T-06 Dangerous file accepted
- **P / I:** med / med. A renamed executable, or an oversized file (US-08/S2, S3, US-27/S2, S3).
- **Trigger:** an upload test with a renamed `.exe` passes. A request above the size limit is accepted.
- **Mitigation:** an allow-list for ID scans, a block-list for results, content-type detection by magic bytes, size limits in one upload middleware, `Content-Disposition: attachment`, never served as static files.
- **Lives in:** ADR-0004, ADR-0005; `verification` and `delivery` modules.

### T-07 Hosted service asleep or slow at the demo — ACCEPTED
- **P / I:** med / med.
- **Trigger:** the first request takes tens of seconds.
- **Mitigation:** warm-up before the demo. The local run is the primary path, with a tunnel as a remote fallback.
- **Lives in:** ADR-0009.

### T-08 Confirmation email does not arrive when hosted
- **P / I:** med / med. Free SMTP limits, spam folders, blocked sender.
- **Trigger:** a hosted registration waits for a confirmation that never comes.
- **Mitigation:** seeded, already-confirmed demo accounts. A dev outbox page locally. The `Mailer` port keeps the provider replaceable.
- **Lives in:** ADR-0006; see `integrations.md`.

### T-09 Chat polling feels slow — ACCEPTED
- **P / I:** low / low. "Миттєво" (US-23/S1) is interpreted as a few seconds.
- **Trigger:** a reviewer says chat is laggy.
- **Mitigation:** shorter poll interval while a chat is open. The cursor design allows a later switch to SSE.
- **Lives in:** ADR-0005.

### T-10 Shared package or workspace setup breaks builds
- **P / I:** med / med. Wrong TypeScript paths, a package that works in dev but not in the production run.
- **Trigger:** `npm run build` or `npm start` fails after a clean clone.
- **Mitigation:** the shared package is consumed as source. The API runs with `tsx`. CI runs install, typecheck, test and build.
- **Lives in:** ADR-0003.

### T-11 Two instances against one SQLite file
- **P / I:** low / high. A host scales to two instances or restarts overlap.
- **Trigger:** "database is locked" errors or diverging data.
- **Mitigation:** configure the host for exactly one instance. Document it in the deploy notes.
- **Lives in:** ADR-0004, ADR-0009.

---

## 2. Product risks

### P-01 Reviewers expect real money — ACCEPTED
- **P / I:** med / high. Simulated payments (digest A-06) can undermine the "safe payment" promise (US-04, US-26).
- **Trigger:** a reviewer asks to pay with a real card.
- **Mitigation:** every payment screen is labelled as a sandbox. The `PaymentProvider` port shows where a real provider plugs in. Explain the choice in the demo.
- **Lives in:** ADR-0007; `payments` module.

### P-02 Empty marketplace at the demo
- **P / I:** med / high. No tasks or students means no flow to show (README risk 2).
- **Trigger:** the feed is empty or the moderation queue has nothing to approve.
- **Mitigation:** a realistic seed (verified students, published tasks, one task per status). A scripted walkthrough of the seven journey steps.
- **Lives in:** ADR-0003, ADR-0009 (seed).

### P-03 Escrow stuck — ACCEPTED
- **P / I:** med / med. No dispute or auto-accept process (digest G-08, A-09). Funds can sit in escrow.
- **Trigger:** a task stays `in_review` for days.
- **Mitigation:** the moderator or admin can release to the student or refund the customer manually. Unlimited revisions in the MVP.
- **Lives in:** ADR-0007; `admin` module.

### P-04 Moderation is the bottleneck — ACCEPTED
- **P / I:** med / med. Two manual queues (US-39, US-40) and no SLA (G-17).
- **Trigger:** more than a few items wait in either queue during testing.
- **Mitigation:** team members act as moderators in the demo. A conditional update means two moderators cannot both decide the same item.
- **Lives in:** ADR-0007; `verification` and `tasks` modules.

### P-05 Domain allow-list rejects a real student
- **P / I:** med / med (digest G-15, A-17).
- **Trigger:** a registration is rejected with «Дозволено реєстрацію лише з використанням університетської електронної пошти» for a real student.
- **Mitigation:** an admin-editable list. Seed with common Ukrainian university domains.
- **Lives in:** ADR-0006; `identity` module.

### P-06 Role assumptions turn out wrong
- **P / I:** med / med. Customers sign up with any email (A-01) and one role per account (A-02), neither of which the requirements state.
- **Trigger:** stakeholder feedback, or a request for one person to act as both.
- **Mitigation:** the role is one column and the policies are centralised, so extending is a contained change. Confirm A-01 and A-02 with stakeholders early.
- **Lives in:** ADR-0006.

### P-07 Privacy or legal objection — ACCEPTED (partly)
- **P / I:** med / high. ID scans (NFR-10), card numbers (NFR-11), terms and consent (G-21).
- **Trigger:** a question from a reviewer or instructor about personal data.
- **Mitigation:** access limited to the owner and moderators. Do not store full card numbers after processing (A-10). A consent checkbox at registration. Documents deleted after the decision plus a retention period (A-18). Accepted: no legal review and no tax handling in the MVP.
- **Lives in:** ADR-0004, ADR-0006; `verification`, `payments` modules.

### P-08 Commission changes while tasks are in flight
- **P / I:** low / med (US-03/S3).
- **Trigger:** the card net amount differs from the credited amount after an admin changes the rate.
- **Mitigation:** the rate is snapshotted on the task at publication.
- **Lives in:** ADR-0007.

### P-09 Homework or a forged card passes moderation — ACCEPTED
- **P / I:** med / med. Moderation is manual (US-39, US-40, US-41).
- **Trigger:** a moderator notices a task or document that should have been rejected.
- **Mitigation:** the moderator can unpublish a task that has no executor (digest G-17) and revoke student status manually. Accepted that detection is human.
- **Lives in:** `verification` and `tasks` modules.

---

## 3. Team risks

### M-01 42 stories do not fit into 5 weeks
- **P / I:** high / high. Parallel courses reduce real capacity.
- **Trigger:** by the end of week 2, the walking skeleton plus fewer than about 10 stories are done. Any week with a slipped milestone.
- **Mitigation:** build vertical slices along the journey, not by layer. Agree the cut list in week 1: first to go are US-05 (visual example), US-35 polish, US-37/S3 sorting, the mobile polish scenarios, and the extra edge-case scenarios. The happy path of journey steps 1 to 7 is the protected core.
- **Lives in:** planning (all ADRs).

### M-02 Skill gap with the chosen libraries
- **P / I:** high / med. Drizzle, TanStack Query and Zod are new to some.
- **Trigger:** a story stalls for more than two days on tooling, not on logic.
- **Mitigation:** the strongest developers write one complete reference slice (for example application submission) in week 1. Others copy its structure. Pair on the first slice per person.
- **Lives in:** ADR-0002, ADR-0004, ADR-0008.

### M-03 Deployment never works
- **P / I:** med / med. No DevOps experience.
- **Trigger:** no working hosted URL by the start of week 5.
- **Mitigation:** local demo is the primary path (ADR-0009). Hosting is time-boxed to one day. A tunnel is the fallback.
- **Lives in:** ADR-0009.

### M-04 Merge conflicts and inconsistent code
- **P / I:** high / med. Six people, plus Claude Code generating code in different styles.
- **Trigger:** more than two conflicting pull requests in a week. Code that does not follow the module template.
- **Mitigation:** module ownership. Small pull requests. A written module template and conventions file for Claude Code. CI runs typecheck and tests. Gherkin scenarios become tests, which act as the specification.
- **Lives in:** ADR-0002, ADR-0003.

### M-05 Integration happens too late
- **P / I:** med / high.
- **Trigger:** no end-to-end click-through (register to accept result) by the end of week 2.
- **Mitigation:** a walking skeleton first: login, create task, moderate, apply, one real transaction, shown in the UI.
- **Lives in:** ADR-0003, ADR-0005.

### M-06 Only one person understands the money code
- **P / I:** med / high.
- **Trigger:** a pull request in `payments` or a state machine is reviewed by nobody else.
- **Mitigation:** ADR-0007 and its tests are the shared understanding. Two reviewers on `payments`. A short walkthrough in week 3.
- **Lives in:** ADR-0007.

### M-07 A role is under-used
- **P / I:** med / low. The requirements contain no AI feature, so the AI & Automation role has no obvious backlog.
- **Trigger:** that person has no assigned stories by the end of week 1.
- **Mitigation:** assign test automation (Gherkin scenarios to tests, the invariant script, the end-to-end happy path), the seed data and the CI workflow.
- **Lives in:** planning.

---

## Risks consciously accepted for the MVP

| Risk | Why we accept it |
|---|---|
| T-02 Hosted data loss | The demo data is reproducible from the seed. |
| T-07 Cold start | The local run is the primary demo. |
| T-09 Polling latency | A few seconds satisfies the intent of "instant" at no cost. |
| P-01 Simulated payments | A real provider is out of reach for budget and regulation. The port keeps the path open. |
| P-03 Stuck escrow | Manual admin resolution is enough at demo scale. |
| P-04 Moderation bottleneck | The team is the moderator. |
| P-07 Legal and privacy | Mitigated technically, with no legal review. |
| P-09 Moderation errors | Detection is human by design (US-39, US-40). |
