# ADR-0004: SQLite with Drizzle, files on local disk

**Status:** Proposed
**Date:** 2026-10-27

## Context

The data has strict money and state rules (escrow, ledger, single executor), so it needs real transactions and unique constraints. The team wants a zero-install local start and has a 0 UAH hosting budget. Files are student ID scans (10 MB, example value) and result files (50 MB, example value).

## Options

| Option | Pros | Cons |
|---|---|---|
| **SQLite file + Drizzle** (`better-sqlite3`) | No install. Synchronous driver, so no `await` inside transactions. SQL-like schema that is easy to read and review. | Native module (install risk). Hosted data lives on the host's disk. |
| SQLite file + Prisma | Gentler tooling and learning curve. | Generate step. Async transactions. No benefit for locking on SQLite. |
| Hosted Postgres (free tier) | Real database. | Shared dev DB or a local Postgres. Needs internet. Free tier terms change. |
| Postgres embedded (PGlite) + hosted Postgres | Same dialect everywhere. | Newer, more moving parts. |
| Local Postgres via Docker | Production-like. | Conflicts with "no DevOps" and the one-command start. |

## Decision

- **Store:** SQLite file `data/ctoc.db`, accessed with `better-sqlite3`.
- **ORM and migrations:** Drizzle with SQL migration files committed to the repo. The Database Developer owns the schema.
- **Money** is stored as integer kopecks. Timestamps are stored in UTC and converted for display (US-22/S3).
- **Statuses** are text columns with `CHECK` constraints that list the allowed values.
- **Files:** a `FileStorage` port with a local-disk implementation in `data/uploads/`. Files are served **only** through an authorized API endpoint (never as static files) with `Content-Disposition: attachment`, and the type is checked by content (magic bytes), not just by extension (US-08/S2, US-27/S2).
- `data/` is git-ignored. `npm run db:reset` recreates and reseeds it.

If `better-sqlite3` fails to install on some machine (native build), the fallback is Node's built-in SQLite module, evaluated when needed.

## Consequences

- **Simpler:** clone, install, run. No server to manage. Backups are a file copy.
- **Harder:** one writer at a time, so the API runs as a single instance. On a free host with an ephemeral disk, data and uploads are lost on redeploy, which we accept for the demo (see the risk register) and mitigate with a deterministic seed.
- **Postponed:** Postgres. The schema and constraints are written in portable SQL, so the move is a migration project, not a rewrite.

If the team prefers Prisma, the decision is still sound: swap the ORM, keep SQLite. I lean Drizzle because the synchronous transaction API makes the invariants in ADR-0007 easier to get right. No disagreement with `options.md`.

## Related stories

US-08, US-27 (uploads); US-26, US-34, US-36 (money); NFR-09, NFR-10, NFR-19.
