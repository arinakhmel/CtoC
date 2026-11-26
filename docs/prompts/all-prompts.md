# Усі промпти й скіл, використані в роботі над тестами US-02, US-03, US-04

Документ збирає в одному місці тексти, якими ставили завдання ШІ (Claude Code) на кожному етапі. Тексти наведено дослівно. Звіт про результат: [`../testing-report.md`](../testing-report.md).

Тексти з файлів у `docs/prompts/` включено з самих файлів, їх зміст тут не перероблявся.

| № | Етап | Джерело |
|---|---|---|
| 1 | Стратегія тестування | `testing-strategy-prompt.md` |
| 2 | Аудит і дописування тестів US-02/03/04 | `generate-tests-prompt.md` |
| 3 | Скіл `implement-story` | `implement-story-skill.md` |
| 4 | Перевірка тестів за критеріями та повний прогін | повідомлення в сесії |
| 5 | Тест «зламай код навмисно» | повідомлення в сесії |
| 6 | Аудит коду й UI, виправлення дрібних багів | повідомлення в сесії |
| 7 | Створення звіту про тестування | повідомлення в сесії |
| 8 | Службові запити (merge, Chrome, коміти, цей документ) | повідомлення в сесії |

Примітка щодо скіла: `/implement-story` налаштований так, що його може запускати лише користувач. У цій сесії ШІ його не запускав. Реалізації US-02 і US-04 були зроблені раніше (гілки `feature/us-02`, `feature/us-04`) і змерджені в `practice-6`. Тому текст скіла наведено як зафіксований інструмент проєкту, а не як промпт, виконаний у цій сесії.

---

## 1. Стратегія тестування

Файл: `docs/prompts/testing-strategy-prompt.md`. Результат: `docs/testing-strategy.md`.

````text
Analyze the architecture, tech stack, dependencies, and existing features of this repository. Based on your findings, create a concise, practical testing strategy document at `docs/testing-strategy.md` (strictly 1–2 pages long, zero generic theoretical fluff—everything must apply specifically to our codebase).

Structure the document into these three clear sections:

1. **Scope (Automated vs. Manual)**:
   - Specify which core user flows, business logic, validation rules, and API/data operations will be covered by automated tests.
   - Explicitly list what is intentionally left for manual testing (e.g., visual UI layout, CSS styling, animations, responsive behavior).

2. **Tools & Testing Levels**:
   - Select and justify the exact testing frameworks and libraries best suited for our project's stack (e.g., Vitest/Jest, Pytest, Supertest, React Testing Library, etc.).
   - Define the test levels we will use (e.g., Unit tests for isolated logic/utilities, Integration/API tests for endpoints/services, Component tests) and specify the single terminal command to run the entire test suite.

3. **Test Organization & Test Data Isolation**:
   - Define the exact directory structure and file naming conventions for tests in this repository.
   - Explain how test data, databases, external APIs, or application state are seeded, mocked, isolated, and cleaned up between test runs so that tests remain deterministic and never interfere with each other.

After creating `docs/testing-strategy.md`, also save this exact prompt text into `docs/prompts/testing-strategy-prompt.md` so we have a record of the prompt used.

````

---

## 2. Аудит наявних тестів і дописування відсутніх

Файл: `docs/prompts/generate-tests-prompt.md`. Результат: тест `no-store` для `PUT`/`GET /api/mod/settings` у `settings.test.ts`; для US-02 і US-04 тоді не було реалізації (були лише заглушки), тому тести написано не було.

````text
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

````

---

## 3. Скіл `implement-story`

Файл: `.claude/skills/implement-story/SKILL.md`, копія в `docs/prompts/implement-story-skill.md`. Повний текст:

````markdown
---
name: implement-story
description: Implement one user story (US-xx) from the requirements. Reads the story and its traceability row, proposes a plan, waits for approval, then implements it and updates traceability. Use when asked to build, implement or work on a story.
argument-hint: US-xx
disable-model-invocation: true
---

Implement story **$ARGUMENTS**. Work in this order and do not skip the approval step.

## 1. Read (no edits yet)

1. Normalise the argument to `US-nn`. If it is missing or not one of US-01…US-50, ask for it.
2. Read the story: its title, **Чек-лист** and the three Gherkin scenarios. They are in `docs/US-nn.md` if that file exists, otherwise in `docs/requirements.md` §4 (`#### [US-nn]`).
3. Read its row in `docs/architecture/traceability.md` §1: endpoints, pages, entities, and the expected code per scenario (S1, S2, S3).
4. Read the pieces it points to, and nothing more:
   - `docs/architecture/api.md`: the endpoint rows, the error codes and the example bodies it uses;
   - `docs/architecture/domain-model.md`: entity rules, invariants (INV-xx) and the state machine it touches;
   - `docs/architecture/data-model.md`: the tables involved;
   - the ADR it relies on (ADR-0006 for access, ADR-0007 for money and counters).
5. Check `traceability.md` §4 and `overview.md` §7.2 for this story. A scenario marked ⚠ or a row about this story means a known conflict. Use the decided interpretation (✔) if there is one. If it is still open, say so in the plan and propose the cheapest option.
6. Look at what already exists (`apps/api/src/modules/`, `apps/web/src/`, `packages/shared/src/`) so the plan extends it.

## 2. Propose a plan and STOP

Write a short plan with these headings, then **wait for the user's approval. Do not edit any file before the user says to go ahead.**

- **Scope**: one sentence, and which scenarios are in this change.
- **Endpoints**: method, path, access, success status, error codes (from `api.md`). Say if `api.md` needs a change.
- **API files**: module folder and files to create or change (`routes`, `service`, `serializer`, `policy`, `domain`, `repo`).
- **Shared**: new or changed schemas, enums, limits, error codes.
- **Schema**: Prisma model changes and the migration SQL (CHECKs, partial indexes). Say if `data-model.md` needs a change.
- **Pages**: routes from `overview.md` §4, components, queries, which error codes each form handles.
- **Transactions and invariants**: which steps are atomic, the conditional `updateMany` conditions, the INV-xx involved.
- **Tests**: a table, one row per Gherkin scenario: `US-nn sc.N` → test level → the assertion (status, code, state).
- **Open points**: conflicts, assumptions, anything that needs a decision.

## 3. Implement (after approval)

Follow `.claude/rules/api.md` and `.claude/rules/web.md`. Order:

1. Shared schemas and codes (`packages/shared`), then their unit tests.
2. Prisma schema and migration if needed. Check there is no drift (see `apps/api/prisma/README.md`).
3. API module: domain → repo → policy → service (transaction) → serializer → routes. Register the router.
4. Web: queries, page, form with the shared schema. Replace the stub and keep the route list in sync with `overview.md`.
5. Tests: one per scenario, named `US-nn sc.N …` (use the `/unit-tests` approach for API and unit tests). Add the rollback and race tests if the story is atomic.
6. If a document had to change (`api.md`, `data-model.md`), change it in the same pull request.

## 4. Verify and update traceability

1. Run `pnpm typecheck` and `pnpm test`. Fix failures. Run `pnpm test:e2e` if you changed a journey step.
2. Update `docs/architecture/traceability.md` §5 (Implementation status): add or update the row for the story with `Status` (`done`, `partial: <what is missing>`), the main `Code` files and the `Tests` files. If you resolved a ⚠ scenario, update the matrix row and §4.
3. Report: what changed, which scenarios are covered, what is left, and the commands you ran with their results. Suggest `/check-story US-nn` for an independent check.

````

---

## 4. Перевірка тестів за критеріями приймання та повний прогін

Результат: тест із фразами «резервування» і «виплата на картку» у `payment-safety.test.tsx`; копія скіла; прогін `pnpm typecheck && pnpm test && pnpm test:e2e`.

````text
ак, перевір усі тести для US-02, US-03 і US-04 (how-it-works.test.tsx, payment-safety.test.tsx, e2e/payment-safety.spec.ts, settings.test.ts) за критеріями приймання та граничними випадками:
1. Якщо в payment-safety.test.tsx бракує явної перевірки ключових гарантій оплати (резервування коштів та виплати на картку) або в how-it-works.test.tsx не перевірені граничні випадки (2/5 кроків і порожній опис) — допиши ці перевірки.
2. Збережи текст скіла .claude/skills/implement-story/SKILL.md у файл docs/prompts/implement-story-skill.md (щоб зафіксувати скіл, яким генерувалися тести).
3. Запусти повну перевірку однією командою: pnpm typecheck && pnpm test && pnpm test:e2e, і покажи результат.
````

Супутній запит: «Не качай Chromium через playwright install — використай уже встановлений системний браузер. Тимчасово додай channel: 'msedge' (або 'chrome', якщо встановлений Google Chrome) у playwright.config.ts, прожени pnpm test:e2e, покажи результат усіх E2E-тестів, а потім поверни playwright.config.ts у початковий стан.»

---

## 5. Тест «зламай код навмисно»

Результат: дві спроби мутації й лог червоного FAIL (розділ 1 звіту).

````text
Проведи тест «зламай код навмисно»:
1. Тимчасово зіпсуй одну реальну умову в коді — наприклад, прибери заголовок Cache-Control: no-store у маршруті /api/mod/settings або зламай перевірку мінімальної кількості кроків у HowItWorks.tsx.
2. Запусти відповідний тест і покажи мені лог червоного FAIL (я скопіюю його у звіт).
3. Відкоти зіпсований файл через git checkout і підтвердь, що тест знову зелений.
````

---

## 6. Аудит коду й UI, виправлення багів

Результат: коміт `e480b70` (кнопка повтору, скидання застарілого стану форми), розділ 3 звіту.

````text
Проведи швидкий аудит коду й UI нових сторінок (LandingPage, HowItWorks, PaymentSafetyPage, налаштування комісії). Знайди 2–3 реальні дрібні баги чи недоробки (наприклад, відсутній стан завантаження/помилки, доступність, крайні випадки рендеру) і виправ їх окремим комітом.
````

---

## 7. Створення звіту про тестування

Результат: `docs/testing-report.md`, рядок з єдиною командою в `README.md`.

````text
Створи docs/testing-report.md із 4 розділами:
1. Покриті автотестами історії та сценарії (US-02, US-03, US-04 — Happy Path та Edge Cases) + підтвердження тесту «зламай код навмисно» з уривком логу падіння.
2. Пройдений ручний Smoke-чекліст основних сценаріїв застосунку.
3. Опис 2–3 знайдених під час тестування дефектів і способів їх виправлення.
4. Коротка інженерна рефлексія: де ШІ помилився чи спростив при генерації тестів (наприклад, неточність з ізоляцією у стратегії, відсутність перевірки ключових слів на /payment-safety) і як це було виправлено.
Також перевір, щоб у кореневому README.md була вказана єдина команда запуску тестів.
````

---

## 8. Службові запити

Дослівні короткі повідомлення, що керували ходом роботи:

- «yes, implement US-02 and US-04 with tests» (відповідь на пропозицію; скіл `/implement-story` ШІ запустити не міг).
- «Знайди в git гілках або worktree мою вже готову реалізацію US-02 та US-04 і змерджи їх у поточну гілку practice-6»
- «Поки що PR не відкривай. Закоміть у гілку practice-6 усі поточні зміни (docs/testing-strategy.md, docs/prompts/, payment-safety.test.tsx, settings.test.ts), щоб зафіксувати цей етап.»
- «Збери всі використані під час цієї роботи промпти та текст скіла (з файлів у docs/prompts/, а також промпти для тесту «зламай код навмисно», аудиту багів і створення звіту) в один структурований документ docs/prompts/all-prompts.md із короткими заголовками, для якого етапу кожен промпт застосовувався. Додай посилання на цей файл у docs/testing-report.md.»
