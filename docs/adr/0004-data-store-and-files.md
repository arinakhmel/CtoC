# ADR-0004: SQLite with Prisma, files on local disk

**Status:** Proposed
**Date:** 2026-10-27

## Context

The data has strict money and state rules (escrow, ledger, single executor), so it needs real transactions and unique constraints. The team wants a zero-install local start and has a 0 UAH hosting budget. Files are student ID scans (10 MB, example value) and result files (50 MB, example value).

## Options

| Option | Pros | Cons |
|---|---|---|
| SQLite file + Drizzle (`better-sqlite3`) | No install. Synchronous driver, so no `await` inside transactions. SQL-like schema that is easy to review. | Native module (install risk). Steeper learning curve for this team. |
| **SQLite file + Prisma** | Gentler tooling and learning curve. One schema file, generated typed client, migrations built in. No SQLite native module of our own. | Generate step. Interactive transactions are async. Cannot express `CHECK` constraints and partial indexes in the schema. Hosted data lives on the host's disk. |
| Hosted Postgres (free tier) | Real database. | Shared dev DB or a local Postgres. Needs internet. Free tier terms change. |
| Postgres embedded (PGlite) + hosted Postgres | Same dialect everywhere. | Newer, more moving parts. |
| Local Postgres via Docker | Production-like. | Conflicts with "no DevOps" and the one-command start. |

## Decision

- **Store:** SQLite file `apps/api/data/ctoc.db`, accessed through Prisma Client. The connection URL carries `connection_limit=1`, so writes are serialised.
- **ORM and migrations:** Prisma. `apps/api/prisma/schema.prisma` is the schema and `prisma/migrations/` holds committed migrations. The Database Developer owns the schema.
- **What Prisma cannot express** (`CHECK` constraints and partial unique indexes, see `data-model.md`) is written by hand in the migration SQL. Prisma tolerates this: `prisma migrate diff` stays empty. Such a migration is never regenerated, only extended.
- **Money** is stored as integer kopecks. Timestamps are stored in UTC and converted for display (US-22/S3).
- **Statuses** are text columns (Prisma on SQLite has no native enum) with a `CHECK` constraint that lists the allowed values, and a matching enum in `packages/shared`.
- **Files:** a `FileStorage` port with a local-disk implementation in `data/uploads/`. Files are served **only** through an authorized API endpoint (never as static files) with `Content-Disposition: attachment`, and the type is checked by content (magic bytes), not just by extension (US-08/S2, US-27/S2).
- `apps/api/data/` is git-ignored. `pnpm db:reset` recreates the database.

If Prisma's engine download fails on some machine (restricted network), the engines can be fetched once and cached, or the machine can use the CI-built `node_modules`.

## Consequences

- **Simpler:** clone, install, run. No server to manage. Backups are a file copy.
- **Harder:** one writer at a time, so the API runs as a single instance. On a free host with an ephemeral disk, data and uploads are lost on redeploy, which we accept for the demo (see the risk register) and mitigate with a deterministic seed.
- **Postponed:** Postgres. The schema and constraints are written in portable SQL, so the move is a migration project, not a rewrite.

`options.md` leaned toward Drizzle, mainly because its synchronous driver rules out `await` inside a transaction. This ADR picks Prisma because the team prefers it and the learning curve matters more here. The price is that ADR-0007 can no longer rely on a synchronous driver. It relies on conditional `updateMany` calls and unique constraints, which are enforced by the database either way.

## Related stories

US-08, US-27 (uploads); US-26, US-34, US-36 (money); NFR-09, NFR-10, NFR-19.
