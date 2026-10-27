# External Integrations and Dependencies

Everything the system or the team depends on outside our own code. For each: what we take, how (API, link, or just a format), and what we do if it is unavailable.

**Not integrated:** Telegram and other messengers are out of scope for the MVP (`requirements.md` §2). GitHub has no product integration. It appears only as development tooling (see below). Nothing in the product calls a third-party API at runtime except the optional email provider.

## Summary

| Dependency | Type | Needed at runtime? | If unavailable |
|---|---|---|---|
| Email (SMTP provider) | Optional API-like (SMTP) | Only when hosted | Dev outbox page, seeded confirmed accounts |
| Payment provider | None in the MVP (simulated port) | No | Not applicable |
| Database | Local file, no service | Yes | Reseed |
| File storage | Local disk, no service | Yes | Reseed, re-upload |
| Hosting (free tier) | Platform | Only for a hosted demo | Run locally, tunnel |
| GitHub (repo, Actions) | Development tooling | No | Run checks locally |
| npm registry | Development tooling | At install only | Cached `node_modules`, lockfile |
| University domain list | Static data we maintain | Yes (registration) | Admin edits the list |
| Browser fonts and icons | Bundled, no CDN | No external | Not applicable |

---

## Email (SMTP provider)

- **What we take:** delivery of transactional emails. Registration confirmation and resend (US-06, US-07), and later password reset. Nothing else is sent by email (in-app notifications cover the rest, A-15).
- **Integration type:** a `Mailer` port (ADR-0006). The hosted implementation uses SMTP credentials from environment variables. The local implementation is console output plus a dev-only outbox page that shows the confirmation link.
- **Constraints:** free tiers limit volume and sender reputation, and a new sender domain often lands in spam. Check current limits when choosing.
- **If unavailable:** registration still works. Confirmation emails do not arrive. The fallback for a demo is seeded, already-confirmed accounts and the outbox page. The system must not fail registration because a send failed. It records the failure and offers «Надіслати лист повторно» (US-07/S3).
- **Risk:** T-08.

## Payment provider

- **What we take:** nothing in the MVP. Escrow hold and release, student balance credit and withdrawal are simulated by an internal ledger (ADR-0007).
- **Integration type:** a `PaymentProvider` port with a simulated implementation. All payment screens are labelled sandbox.
- **What a real provider would add:** card capture and hold for the customer (US-26), authenticated callbacks (webhooks, NFR-14, US-34/S3), payouts to Ukrainian cards (US-36), regulatory and legal onboarding. These are explicitly out of the MVP. Any provider choice is a new ADR.
- **If unavailable:** not applicable now.
- **Risk:** P-01.

## Database (SQLite)

- **What we take:** persistent relational storage with transactions and constraints.
- **Integration type:** an embedded file (`data/ctoc.db`) through a native Node module. There is no service to run or reach (ADR-0004).
- **If unavailable or lost:** `npm run db:reset` recreates and reseeds. On a hosted instance the disk may be wiped on redeploy, which is accepted (T-02). If the native module does not install on a machine, the fallback is Node's built-in SQLite module (T-01).

## File storage

- **What we take:** storage for student-ID scans and result files.
- **Integration type:** a `FileStorage` port with a local-disk implementation in `data/uploads/`. Files are served only through authorized endpoints (T-05, T-06).
- **If unavailable or lost:** the metadata remains but files are missing. The UI must show a clear "file unavailable" state rather than crash. Re-upload is the recovery. A hosted object store can later replace the implementation behind the port.

## Hosting (free tier)

- **What we take:** a public URL for an optional demo (ADR-0009).
- **Integration type:** platform only. One Node web service that serves the API and the built frontend. There is no vendor-specific API in our code. We use environment variables and a `/healthz` endpoint.
- **If unavailable or asleep:** run locally. A free tunnel from a laptop gives a public URL. Free-tier terms change, so the provider is chosen in week 4 after checking them (T-07, M-03).

## GitHub (development tooling only)

- **What we take:** source hosting, pull requests, and a single Actions workflow (install, typecheck, test, build).
- **Integration type:** none in the product. It is not an API integration of the app.
- **If unavailable:** work continues locally. The same commands (`npm run typecheck`, `npm test`, `npm run build`) run on every machine.

## npm registry

- **What we take:** packages at install time only.
- **Integration type:** package manager, with the lockfile committed.
- **If unavailable:** an already-installed `node_modules` keeps working. Do not rely on installing during the demo.

## University domain list

- **What we take:** the set of allowed university email domains (BR-01, G-15).
- **Integration type:** a static data file seeded into a table that admins can edit. It is not an API. There is no external lookup.
- **If incomplete:** the admin adds the domain (P-05).

## Fonts, icons, scripts

- **What we take:** nothing from a CDN. Fonts and icons are bundled with the frontend, so the app works offline and in a restricted network (ADR-0008).
