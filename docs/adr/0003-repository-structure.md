# ADR-0003: One monorepo with npm workspaces

**Status:** Proposed
**Date:** 2026-10-27

## Context

The same rules must hold in the UI and on the server: the same validation (title length, price minimum, note length), the same status names, and the same money arithmetic (`gross = commission + net`, US-35/S2). The project must start locally with as few commands as possible after `git clone`, and the team has no DevOps experience.

## Options

| Option | Pros | Cons |
|---|---|---|
| **Monorepo, npm workspaces** | One clone and install. Shared package with no publishing. No extra tool. | A small amount of workspace configuration. |
| Monorepo with Turborepo or Nx | Task caching. | Not needed at this size. Another tool to debug. |
| Two repos | Clear separation. | Shared types must be copied or published. Each story needs two PRs. |
| Single package | Fastest day one. | Client and server code mix. No clean place for shared code. |

## Decision

One repository using **npm workspaces**:

```
apps/api/        Node.js backend (modules per ADR-0002)
apps/web/        React frontend (features per ADR-0002)
packages/shared/ Zod schemas, status enums, money helpers, Ukrainian messages
docs/            requirements, analysis, ADRs, architecture
```

Root scripts: `dev` (API and web together), `build`, `start`, `test`, `typecheck`, `db:reset`, `seed`. The API auto-migrates and seeds an empty database on startup, so after `npm install` the single command is `npm run dev`.

Details:
- The shared package is consumed as TypeScript source, with no separate build step. The API runs with `tsx`, including for the demo, so there is no compile pipeline to maintain.
- Node version is pinned in `.nvmrc` and `engines`.
- Environment variables are documented in `.env.example`. Local defaults work with no `.env` file.

## Consequences

- **Simpler:** one command, shared types, atomic cross-layer PRs.
- **Harder:** everyone shares one dependency tree. A broken install blocks all six people.
- **Postponed:** a build pipeline for the API (running through `tsx` is acceptable for a demo), Turborepo.

No disagreement with `options.md`.

## Related stories

US-13, US-17, US-35 (shared validation and money rules); NFR-19.
