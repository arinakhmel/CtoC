---
paths:
  - "docs/project_context.md"
  - "docs/US-*.md"
  - "docs/requirements.md"
---

# Input documents are read-only

`docs/project_context.md` and `docs/US-*.md` are the input requirements. **Do not edit them.** A hook (`.claude/hooks/protect-input-docs.mjs`) blocks it.

In this repository the input lives in a different place:
- the project context is `README.md`;
- all stories and Gherkin scenarios are in `docs/requirements.md` (50 stories, US-01 to US-50);
- `docs/project_context.md` and `docs/US-*.md` do not exist.

So treat `docs/requirements.md` the same way: never reword an existing story or scenario. It may be edited only on the product owner's explicit request, for example to add a new story. The hook does not block it, because that is how US-43 to US-50 were added.

## When the input is wrong, missing or contradictory

Do not fix it silently and do not work around it in code. Write it down:

1. Add a row to **"Open questions"** in `docs/architecture/overview.md` §7.2 (next free `OQ-nn`): the stories and scenarios involved, the conflict, and what the design does meanwhile.
2. If it affects one story, also add the story to `docs/architecture/traceability.md` §4 (weakly covered or unclear).
3. Tell the user. Implement the interpretation the user decided, or the cheapest one, and say so in the test name comment (`// W-xx, decided: …`).
