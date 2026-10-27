# ADR-0009: Local-first demo, optional single hosted service

**Status:** Proposed
**Date:** 2026-10-27

## Context

The budget is 0 UAH and the team has no DevOps experience. Local launch after `git clone` is a stated requirement. The data store is a SQLite file (ADR-0004). Free hosting tiers change often, usually sleep when idle, and often have disks that are wiped on redeploy.

## Options

| Option | Pros | Cons |
|---|---|---|
| **Local first, plus optional hosted: one Node service serving the API and the built frontend** | The demo never depends on hosting. One origin, so no CORS or cross-site cookie issues. | Hosted data may reset. Cold starts. |
| Split hosting (static frontend, API elsewhere) | Fits typical free tiers. | Two deploys, CORS, `SameSite` cookie problems. |
| Serverless functions | Free scale-to-zero. | Poor fit for a writable SQLite file and for uploads. |
| Docker-based deploy | Reproducible. | Needs skills the team does not have. |
| Local only | Zero risk. | Not reachable from other devices. A tunnel from a laptop is a free fallback. |

## Decision

1. **Primary target:** `git clone` → `pnpm install` → `cp .env.example .env` → `pnpm dev`. Pending migrations are applied on start (ADR-0003). A production-like run serves the built frontend from the API.
2. **Optional hosted demo:** one Node web service on a free tier that serves the API and `apps/web/dist` from the same origin, with a `/healthz` endpoint. It runs one instance. The provider is chosen in week 4 after checking current free-tier terms. Candidates include Render, Railway and Fly, but none is promised.
3. **Data on the host is disposable.** The seed recreates demo accounts, tasks and a moderator on an empty database. Before a demo, run through the scripted flow once to warm up the service.
4. **CI:** one GitHub Actions workflow on pull requests: install, typecheck, test, build.
5. **Remote demo fallback:** run locally and expose with a free tunnel.
6. Hosting work is **time-boxed to one day** and never blocks features.

## Consequences

- **Simpler:** the demo is not at the mercy of a hosting provider. No CORS setup.
- **Harder:** the hosted instance can lose data and may start slowly after sleeping. Only one instance is possible while the store is SQLite.
- **Postponed:** persistent hosted data, custom domain, monitoring, backups, a real email provider.

No disagreement with `options.md`.

## Related stories

None directly. Supports every demo scenario and NFR-04.
