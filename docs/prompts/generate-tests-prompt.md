Inspect existing tests for US-02, US-03, and US-04 across `apps/api` and `apps/web`. Compare them against the Given-When-Then acceptance criteria in `docs/` and write any missing automated tests following `docs/testing-strategy.md`:

1. **US-03 (Commission & Admin Settings):**
   - Happy Path: `GET /api/public/settings` returns 200 without auth; commission rate is visible on `/` or `/terms`.
   - Edge Cases: `PUT /api/mod/settings` sets `Cache-Control: no-store` for admin; out-of-range rate returns `400 VALIDATION_FAILED`; client and student roles receive `403`.

2. **US-02 ("How it works" block):**
   - Happy Path: renders `<ol>` with 3–4 steps.
   - Edge Cases: passing 2 or 5 steps falls back to the default 3–4 steps; a step with empty description renders fallback text or is hidden (no empty DOM elements).

3. **US-04 ("Payment and safety" `/payment-safety`):**
   - Happy Path & Content Guard: accessible without login; asserts presence of «резервування» and «виплата на картку».
   - Mobile Edge Case (Playwright): on narrow mobile viewport, `scrollWidth <= clientWidth`.

Run `pnpm test` and `pnpm test:e2e` to confirm all tests pass. Save this exact prompt text into `docs/prompts/generate-tests-prompt.md` (and also save or reference the `.claude/skills/` file if a skill was used).

---
Skill used: none (no file from `.claude/skills/` was invoked; `/unit-tests` and `/e2e-tests` exist but were not run).
