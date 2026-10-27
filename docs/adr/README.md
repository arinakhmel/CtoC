# Architecture Decision Records

Short records of decisions that are expensive to change later. Written for people who need the answer to "why is it like this?", so they stay short.

## Index

| ADR | Decision | Status |
|---|---|---|
| [0001](0001-platform-web.md) | Platform: responsive web (React) | Proposed |
| [0002](0002-architecture-style.md) | Architecture style: modular monolith (backend), feature folders (frontend) | Proposed |
| [0003](0003-repository-structure.md) | Repository: npm-workspaces monorepo | Proposed |
| [0004](0004-data-store-and-files.md) | Data store: SQLite + Drizzle, files on local disk | Proposed |
| [0005](0005-backend-api.md) | Backend: Express 5, Zod, REST, error format, polling | Proposed |
| [0006](0006-authentication.md) | Authentication: cookie sessions, one role per account | Proposed |
| [0007](0007-concurrency-and-money.md) | Concurrency and money: DB-enforced invariants, simulated payments | Proposed |
| [0008](0008-frontend-stack.md) | Frontend: Vite, React Router, TanStack Query, Tailwind | Proposed |
| [0009](0009-deployment.md) | Deployment: local first, optional single hosted service | Proposed |

Options behind each decision: [`docs/analysis/options.md`](../analysis/options.md). Requirements: [`requirements-digest.md`](../analysis/requirements-digest.md).

## Statuses

`Proposed` (written, not yet agreed by the team) → `Accepted` (agreed at a team meeting) → optionally `Superseded by ADR-NNNN`.

Do not edit an accepted ADR to reverse it. Write a new ADR that supersedes it and update the status line of the old one.

## When to write an ADR

Write one when **all three** hold:
1. It is hard to reverse once more than about a week of code depends on it.
2. It affects more than one module or more than one person.
3. There are real alternatives, and someone will later ask "why did we do it this way?".

Do **not** write one for:
- a library that can be swapped in a day (date helper, icon set, test utility);
- code style or naming (put it in `CLAUDE.md` or lint rules);
- implementation detail of a single module;
- anything reversible inside one pull request;
- a decision with no real alternative.

## Template

```markdown
# ADR-NNNN: Title

**Status:** Proposed | Accepted | Superseded by ADR-NNNN
**Date:** YYYY-MM-DD

## Context
## Options
## Decision
## Consequences
## Related stories
```

Keep each ADR to about one page. Name files `NNNN-short-name.md`, numbered in the order the decisions were made.
