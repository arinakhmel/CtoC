# Technical Options Analysis

Input for the ADRs in `docs/adr/`. Every option is rated against **our** constraints, not against general best practice.

## Constraints used for rating

| Code | Constraint | Source |
|---|---|---|
| **Skill** | Team of 6 with basic TypeScript, React and Node.js. Little learning budget. | Brief |
| **Time** | 5 weeks to the demo, in parallel with other courses. | Brief |
| **Free** | 0 UAH. Free tiers only. Local launch after `git clone` with as few commands as possible, no DevOps. | Brief |
| **Claude** | Code is written with Claude Code, so the structure must be predictable and mechanical to follow. | Brief |
| **Fit** | Decision-specific: how well the option serves the requirements in `requirements-digest.md`. | Digest |

Only TypeScript, React or React Native, and Node.js are allowed. Rating scale: **+** helps, **0** neutral, **−** hurts.

Payments are simulated for the MVP, behind an interface (digest A-06). Platform was left open and is rated below.

Decisions follow the dependency order from the plan. Each decision lists the ADR that fixes it.

---

## D1. Platform: web or mobile (ADR-0001)

Evidence from the user journey (`requirements.md` §1) and the digest:
- Steps 1 and 2 are public pages (landing, commission, payment, résumé) that must work without login (NFR-01).
- Uploading an ID scan and result files, and escrow, are form and document flows.
- A moderator back office is required (US-39, US-40). It will be a web page whatever the customer-facing platform is.
- Responsive mobile layouts are required (NFR-25), but no push, camera, offline or device APIs are required anywhere.

| Option | Skill | Time | Free | Claude | Fit | Notes |
|---|---|---|---|---|---|---|
| Responsive web (React) | + | + | + | + | + | Runs in any browser. Public pages and public profile (G-14) are just URLs. One codebase also covers the moderator panel. |
| React Native (Expo) | − | − | 0 | 0 | − | Extra toolchain and device or emulator for every teammate. Public pages and back office still need a web app, so it means two clients. |
| Web now plus a React Native shell later | 0 | 0 | 0 | 0 | 0 | Only adds value if the web layer is built as pure API plus UI, which is already true for D1 = web. |

**Tipping criterion:** the moderator back office and public pages must be web anyway, so React Native would double the client work.

**What would have to change:** a requirement for push notifications, camera capture of the student card, or offline use.

---

## D0. Application architecture style (ADR-0002)

### Backend

| Option | Skill | Time | Free | Claude | Fit | Notes |
|---|---|---|---|---|---|---|
| Plain layered/MVC (global `controllers/`, `services/`, `models/`) | + | + | + | 0 | 0 | Easiest to start. Files for one feature are scattered, so 6 people editing at once collide. Rules like "who may call whom" are not visible. |
| **Modular monolith** (one deployable, folders per business module, layered inside each) | 0 | + | + | + | + | One process, one DB transaction across modules (needed for NFR-16). Module folders map 1:1 to the digest entities. |
| Clean/hexagonal everywhere | − | − | + | 0 | 0 | Ports and adapters for every dependency. Overhead we cannot afford, but 3 real ports are justified (payments, mail, file storage). |
| Microservices | − | − | − | − | − | Several deployables, network calls, distributed transactions. Directly conflicts with atomic escrow and acceptance and with the free-tier budget. |

**Tipping criterion:** atomic multi-step transitions (selection plus escrow, acceptance plus credit plus experience record) need one transaction, and 6 people need non-colliding folders.

**What would have to change:** independent scaling or independent release of a part (for example a separate payment service), which is not an MVP concern.

### Frontend

| Option | Skill | Time | Free | Claude | Fit | Notes |
|---|---|---|---|---|---|---|
| Layer-based (`components/`, `hooks/`, `pages/`) | + | + | + | 0 | 0 | Fine for 5 pages. At about 20 screens, one story touches 4 folders. |
| **Feature-based** (`features/<module>/{api,components,pages}` plus `ui/`, `lib/`) | 0 | + | + | + | + | Mirrors the backend modules, so one ownership unit per story group. |
| Page-per-file framework conventions | 0 | 0 | + | 0 | 0 | Tied to a meta-framework. See D3. |

**Tipping criterion:** the same module names on both sides give Claude Code and the team a single predictable mapping.

**What would have to change:** nothing realistic within the semester.

---

## D2. Repository structure (ADR-0003)

| Option | Skill | Time | Free | Claude | Fit | Notes |
|---|---|---|---|---|---|---|
| **Monorepo, npm workspaces** (`apps/web`, `apps/api`, `packages/shared`) | + | + | + | + | + | One clone, one install, one `dev` command. Shared Zod schemas, status enums and money helpers between client and server. |
| Monorepo plus Turborepo or Nx | 0 | 0 | + | 0 | 0 | Caching and task graph are not needed at this size. One more tool to debug. |
| Two repos (frontend, backend) | 0 | − | 0 | − | − | Shared types must be published or copied. Cross-repo changes for every story. Two clones for "one command". |
| Single package (frontend and backend in one `src/`) | + | 0 | + | − | − | Fastest on day one. Client and server code mix, so the shared-types boundary disappears. |

**Tipping criterion:** the shared package (validation schemas, status enums, money arithmetic) is what keeps UI messages and server rules identical.

**What would have to change:** a second team or an external consumer of the API.

---

## D5. Data store, ORM, file storage (ADR-0004)

Constraints that bite:
- Local launch with no install, and free hosting.
- The money invariants of NFR-16 to NFR-18 need transactions and unique constraints.
- Files: student ID scans (≤10 MB) and result files (≤50 MB, example values).

| Option | Skill | Time | Free | Claude | Fit | Notes |
|---|---|---|---|---|---|---|
| **SQLite file + Drizzle** (`better-sqlite3`, synchronous driver) | 0 | + | + | + | + | Zero setup. A synchronous driver means no `await` inside a transaction, which removes a class of check-then-act races. Needs a native module. Hosted data lives on the host's disk. |
| SQLite file + Prisma | + | + | + | + | 0 | Gentler learning curve and good tooling. Generate step, async transactions, no row locks on SQLite. |
| Hosted Postgres on a free tier (shared dev DB) | 0 | 0 | 0 | + | + | Real database, easy hosting. Six people share one DB or need a local Postgres. Needs internet, and free tiers change. |
| Postgres embedded in Node (PGlite) plus hosted Postgres | − | − | + | 0 | + | Same dialect locally and hosted. Newer and single-connection, more moving parts for a 5-week team. |
| Local Postgres in Docker | − | − | − | 0 | + | Violates "no DevOps" and the one-command launch. |

File storage (decided inside this ADR): local disk behind a storage interface, served only through an authorized endpoint. Alternatives are blobs in SQLite (≤50 MB each bloats the DB) and a free object store (extra account, keys, network).

**Tipping criterion:** zero-install local launch plus simple, reliable transactions.

**What would have to change:** a free hosting option that keeps a disk across restarts is not available **and** persistent hosted data becomes a requirement. Then move to hosted Postgres.

---

## D4. Backend: framework, validation, errors, API style (ADR-0005)

### Framework

| Option | Skill | Time | Free | Claude | Fit | Notes |
|---|---|---|---|---|---|---|
| **Express 5** | + | + | + | + | 0 | Most familiar and documented. Async errors are handled natively in 5.x. Structure comes from our module convention, not the framework. |
| Fastify | 0 | 0 | + | 0 | 0 | Built-in schema validation and speed. Less known, fewer tutorials. |
| NestJS | − | − | + | 0 | + | Strong module structure. Decorators and DI add a learning curve we cannot afford. |
| Hono | 0 | 0 | + | 0 | 0 | Small and modern, less documented for this kind of app. |

### Validation and API style

| Option | Skill | Time | Free | Claude | Fit | Notes |
|---|---|---|---|---|---|---|
| **REST JSON with Zod schemas shared from `packages/shared`** | + | + | + | + | + | Explicit endpoints match the "403 via API" and "malicious API request" scenarios. One schema validates form and server. |
| tRPC | 0 | 0 | + | 0 | 0 | End-to-end types. Poor fit for file upload and for the HTTP 403 and 409 wording in the scenarios. Another concept to learn. |
| GraphQL | − | − | + | − | 0 | Overkill. |
| REST with generated OpenAPI as the contract | 0 | − | + | 0 | 0 | Nice docs. Extra tooling to keep in sync. |

### Error format

| Option | Skill | Time | Claude | Fit | Notes |
|---|---|---|---|---|---|
| **`{ error: { code, message, details? } }` with stable machine codes** | + | + | + | + | UI maps codes to the exact Ukrainian strings in the scenarios. |
| RFC 7807 problem+json | 0 | 0 | 0 | 0 | Standard, but `type` URLs are noise for us. |

### Real-time (chat, notifications)

| Option | Skill | Time | Free | Fit | Notes |
|---|---|---|---|---|---|
| **Polling with an `after` cursor** | + | + | + | 0 | Works on any host. "Миттєво" (US-23/S1) becomes a few seconds. |
| Server-Sent Events | 0 | 0 | 0 | + | Real push. Free hosts can buffer or time out streams. |
| WebSocket | − | − | − | + | Extra library, auth on upgrade, host support. |

**Tipping criterion:** the most familiar tools, with structure enforced by our own convention instead of a framework's.

**What would have to change:** chat latency becomes a stated requirement under about 1 second.

---

## D6. Authentication and authorization (ADR-0006)

Fixes the digest gaps G-01 to G-04, G-22 and the access rules of NFR-04 to NFR-13.

| Option | Skill | Time | Free | Claude | Fit | Notes |
|---|---|---|---|---|---|---|
| **Server-side sessions in an httpOnly cookie, bcryptjs passwords** | + | + | + | + | + | Revocable, simple, same-origin in dev and when hosted. No refresh-token logic. |
| JWT access plus refresh tokens | − | − | + | 0 | 0 | Stateless but revocation and rotation are on us. Easy to get wrong. |
| Hosted auth service (Clerk, Auth0 and similar) | 0 | 0 | 0 | 0 | − | External account and limits. The student-status flow and custom roles still need our own tables. |
| Passwordless magic links only | 0 | 0 | 0 | 0 | 0 | No passwords to store, but every login needs working email, which is fragile locally. |

Roles, decided in the same ADR:

| Option | Fit | Notes |
|---|---|---|
| **One role per account:** `student`, `customer`, `moderator`. Student verification is separate data, not a role. | + | Matches A-02 and A-03. Smallest permission matrix. |
| Multiple roles per account | 0 | Needed only if one person is both student and customer. |

Email: a mailer interface with a console and dev-outbox implementation locally, and SMTP via free tier when hosted.

**Tipping criterion:** the cookie session is the only option whose failure modes the team can reason about in a week.

**What would have to change:** a separate mobile client or third-party API access that cannot use cookies.

---

## D7. Concurrency and money invariants (ADR-0007)

Invariants from the digest: one executor per task (US-25/S2), no double escrow (US-26/S3), single credit (US-34/S3), no over-withdrawal (US-36/S3), accept versus return race (BR-52, BR-53), `gross = commission + net` (US-35/S2).

| Option | Skill | Time | Free | Claude | Fit | Notes |
|---|---|---|---|---|---|---|
| **DB constraints plus conditional `UPDATE … WHERE status = …` in one short transaction** | + | + | + | + | + | Guarded by the database, so it holds even if application code is wrong. Zero rows changed becomes a 409. |
| Optimistic versioning (`version` column) | 0 | 0 | + | 0 | + | Good for edit conflicts. Needs a retry loop. More code for the same guarantee. |
| In-process locks or mutexes | 0 | 0 | + | − | − | Breaks with a second process and hides bugs. |
| `SELECT … FOR UPDATE` row locks | − | 0 | − | 0 | + | Requires Postgres. Same idea if D5 changes. |

Money representation: integer kopecks in the shared package (not floats, not decimals).

Payments: a `PaymentProvider` interface with a simulated implementation, and an append-only ledger (`ledger_entries`) kept with the balances in the same transaction.

**Tipping criterion:** constraints in the database are checked by the database. Everything else relies on every developer remembering a rule.

**What would have to change:** moving to Postgres keeps the same constraints and adds `FOR UPDATE` or serializable retries.

---

## D3. Frontend internals (ADR-0008)

| Concern | Options | Leaning and criterion |
|---|---|---|
| **Build and app model** | **Vite SPA** (+) · Next.js (0) · Create-React-App style (−, unmaintained) | **Vite SPA.** Next.js adds a server/client split and a second runtime to learn. SEO for the landing is not required for the MVP. |
| **Routing** | **React Router** (+) · TanStack Router (0) · framework router (0) | **React Router.** Most documented. Route guards map to the role model of D6. |
| **Server data** | **TanStack Query** (+) · SWR (0) · plain `fetch` plus `useState` (−) | **TanStack Query.** Caching, refetch on focus, and `refetchInterval` give polling for chat and notifications for free. Fixes the "stale status after refresh" scenarios (US-20/S2, US-29/S2). |
| **Forms and validation** | **react-hook-form with the shared Zod schemas** (+) · hand-rolled state (−) | Same schema on client and server, so error messages match. |
| **Styles** | **Tailwind CSS** (+) · CSS Modules (0) · component library such as MUI (0) | **Tailwind.** Fast, well known to Claude Code, mobile breakpoints for NFR-25 without writing CSS files. A kit adds styling to fight and a large bundle. |
| **Language** | Ukrainian only. One dictionary file in the shared package (`messages.uk.ts`). | OOS: no i18n framework. |

**What would have to change:** a requirement for SEO or social-preview pages (public profile, landing) would favour prerendering or Next.js.

---

## D8. Deployment and hosting (ADR-0009)

| Option | Skill | Time | Free | Claude | Fit | Notes |
|---|---|---|---|---|---|---|
| **Local one-command demo as the primary target. Optional hosted: one Node service serving the API and the built frontend.** | + | + | + | + | + | Never blocks features on hosting. One origin means no CORS and cookie problems. |
| Split hosting (static frontend host plus API host) | 0 | − | 0 | 0 | 0 | Two deploys, CORS and cross-site cookies (`SameSite`). |
| Serverless functions | − | − | 0 | − | − | Does not suit a writable SQLite file or file uploads. |
| Docker-based deploy | − | − | − | 0 | 0 | No DevOps experience. |
| Local only, no hosting | + | + | + | + | 0 | Safe, but the demo cannot be opened from other devices. A tunnel from a laptop is a zero-cost fallback. |

CI: a single GitHub Actions workflow (install, typecheck, test, build). Hosting free-tier terms change often, so verify them in week 4 before choosing a provider.

**Tipping criterion:** the demo must work even if hosting fails.

**What would have to change:** a requirement that the platform runs for real users between demos.

---

## Summary

| Decision | Leans toward | Main criterion | ADR |
|---|---|---|---|
| D1 Platform | Responsive web (React) | Moderator back office and public pages are web anyway. No native-only requirement. | ADR-0001 |
| D0 Architecture style | Modular monolith with layers inside modules, 3 ports. Feature-based frontend. | Atomic multi-step transitions need one transaction. Mirrored module names. | ADR-0002 |
| D2 Repository | One monorepo, npm workspaces | Shared Zod schemas and money helpers. One clone, one command. | ADR-0003 |
| D5 Data store | SQLite file with Drizzle. Files on local disk behind an interface. | Zero-install local launch with simple transactions. | ADR-0004 |
| D4 Backend | Express 5, Zod, REST, `{error:{code}}`, polling | Most familiar tools. Explicit endpoints fit the scenarios. | ADR-0005 |
| D6 Authentication | Cookie sessions, one role per account | Only option the team can reason about in a week. | ADR-0006 |
| D7 Concurrency | DB constraints and conditional updates in one transaction. Integer kopecks. Simulated payments behind an interface. | Database-enforced invariants beat remembered rules. | ADR-0007 |
| D3 Frontend internals | Vite, React Router, TanStack Query, react-hook-form, Tailwind | Speed and familiarity. Polling comes with TanStack Query. | ADR-0008 |
| D8 Deployment | Local first. Optional single hosted Node service. | The demo must survive a hosting failure. | ADR-0009 |
