---
name: adr
description: Create a new Architecture Decision Record in docs/adr/ from the template in docs/adr/README.md, with the next number. Requires at least two real alternatives. Use when a decision is hard to reverse, affects several modules or people, and has real alternatives.
argument-hint: <short decision title>
disable-model-invocation: true
---

Create a new ADR for: **$ARGUMENTS**

## 1. Decide whether an ADR is needed

Read `docs/adr/README.md` ("When to write an ADR"). An ADR is for a decision that is (1) hard to reverse after about a week of code, (2) affects more than one module or person, and (3) has real alternatives. If it does not meet all three, say so and stop. Point to the better place instead (`CLAUDE.md`, a rule in `.claude/rules/`, or a code comment).

## 2. Collect the content

Ask the user for anything you cannot find in `docs/`. You need:

- the **context**: what forces the decision, and which stories or NFRs it serves;
- **at least two alternatives** besides "do nothing", each with real pros and cons for this team (6 students, 5 weeks, no DevOps, free tiers, TypeScript only). **If there are fewer than two real alternatives, do not write the ADR.** Ask for another option or conclude that no ADR is needed;
- the **decision** and the **consequences**: what gets simpler, what gets harder, what is postponed.

If an earlier ADR is affected, read it. A decision that reverses an accepted ADR needs a new ADR that supersedes it. Do not edit the old one except its status line.

## 3. Write the file

1. List `docs/adr/`. The next number is the highest `NNNN` plus one, zero-padded to four digits.
2. Create `docs/adr/NNNN-short-name.md` (lower-case, hyphens) with exactly the sections of the template in `docs/adr/README.md`:

```markdown
# ADR-NNNN: Title

**Status:** Proposed
**Date:** YYYY-MM-DD

## Context
## Options
## Decision
## Consequences
## Related stories
```

   - Date: today.
   - **Options**: a table with the option, pros and cons. Mark the chosen one in bold.
   - **Decision**: one short paragraph, concrete enough to check in a diff.
   - **Consequences**: *Simpler*, *Harder*, *Postponed*.
   - **Related stories**: the US-xx, NFR-xx, INV-xx it affects.
   - Keep it to about one page. ADRs are read, not studied.
3. Add a row to the index table in `docs/adr/README.md` (link, one-line decision, status `Proposed`).
4. If the decision changes anything else, list the documents to update (`docs/architecture/*.md`, `CLAUDE.md`, `.claude/rules/*`) and update them or ask. Do not leave documents contradicting the ADR.

## 4. Report

Give the file path, the decision in one line, the alternatives considered, and what else needs updating. Say the ADR is `Proposed` until the team accepts it at a meeting.
