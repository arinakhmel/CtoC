# ADR-0003: One monorepo with pnpm workspaces

**Status:** Proposed
**Date:** 2026-10-27

## Context

The same rules must hold in the UI and on the server: the same validation (title length, price minimum, note length), the same status names, and the same money arithmetic (`gross = commission + net`, US-35/S2). The project must start locally with as few commands as possible after `git clone`, and the team has no DevOps experience.

## Options

| Option | Pros | Cons |
|---|---|---|
| **Monorepo, pnpm workspaces** | One clone and install. Shared package with no publishing. Strict dependency isolation, fast installs. | One extra tool to install (`corepack enable` is enough). pnpm 10 asks to approve dependency build scripts. |
| Monorepo, npm workspaces | Nothing extra to install. | Hoisted `node_modules` hides missing dependencies. |
| Monorepo with Turborepo or Nx | Task caching. | Not needed at this size. Another tool to debug. |
| Two repos | Clear separation. | Shared types must be copied or published. Each story needs two PRs. |
| Single package | Fastest day one. | Client and server code mix. No clean place for shared code. |

## Decision

One repository using **pnpm workspaces** (`pnpm-workspace.yaml`; the pnpm version is pinned in the root `packageManager` field):

```
apps/api/        Node.js backend (modules per ADR-0002)
apps/web/        React frontend (features per ADR-0002)
packages/shared/ Zod schemas, status enums, money helpers, Ukrainian messages
docs/            requirements, analysis, ADRs, architecture
```

Root scripts: `dev` (API and web together), `build`, `typecheck`, `test`, `test:e2e`, and database scripts that forward to `apps/api`. `pnpm dev` applies pending migrations before it starts the API, so after `pnpm install` and copying `.env.example` the only command is `pnpm dev`. Seeding is added with the first story that needs it.

Details:
- The shared package is consumed as TypeScript source, with no separate build step. The API runs with `tsx`, including for the demo, so there is no compile pipeline to maintain.
- Node version is pinned in `.nvmrc` and `engines`. The pnpm version is pinned in `packageManager`.
- Packages are named `@ctoc/web`, `@ctoc/api`, `@ctoc/shared`.
- Environment variables are documented in `.env.example`. Copy it to `.env` once; the defaults work for a local run.

## Consequences

- **Simpler:** one command, shared types, atomic cross-layer PRs.
- **Harder:** everyone shares one dependency tree. A broken install blocks all six people.
- **Postponed:** a build pipeline for the API (running through `tsx` is acceptable for a demo), Turborepo.

`options.md` leaned toward npm workspaces. This ADR uses pnpm because the team chose it. The structure and the single-command goal are unchanged.

## Related stories

US-13, US-17, US-35 (shared validation and money rules); NFR-19.
