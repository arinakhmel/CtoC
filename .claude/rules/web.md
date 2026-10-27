---
paths:
  - "apps/web/**"
---

# Web conventions (apps/web)

Sources: ADR-0002, ADR-0005, ADR-0008, `docs/architecture/overview.md` §4 (pages), `api.md`.

## Where code goes

Feature folders mirror the API modules (ADR-0002): `src/features/<module>/{pages,queries,components}`, plus `src/ui/` (shared primitives), `src/lib/` (api client, helpers) and `src/app/` (router, layout, guards). The skeleton keeps stubs in `src/pages/` until a story is built; move the page into its feature folder when you implement it.

- **pages/**: one component per route in `overview.md` §4. A page composes components and calls hooks. It does not call `fetch`.
- **queries/**: the data layer of the feature: TanStack Query hooks (`useTasks`, `useAssign`…) that call the **api client**. Mutations invalidate the related queries. Polling (chat, notifications) is `refetchInterval` here.
- **api client**: `src/lib/api.ts` (`apiFetch`, `apiPost`) is the only code that calls `fetch`. It turns a failed response into `ApiClientError` with the `code` from `api.md` §2. The base URL comes from `VITE_API_BASE_URL`, never hard-coded.
- A route is added or changed in `src/routes.config.ts` **and** `docs/architecture/overview.md` §4. A test compares them.

## Forms use the shared schemas

- Validate with the schema from `@ctoc/shared` through react-hook-form's Zod resolver. The server uses the same schema, so a rule is written once. Do not copy limits into components.
- Show the error for a field from `details[].code` of `ApiClientError`, and a general error from `error.code`. **Key text and behaviour on the code, not on `message`.** Texts are Ukrainian, from `MESSAGES_UK` or the UI dictionary.
- The price is never an input of an application form (US-13, US-42). Money is displayed from kopecks with one helper.

## Accessible markup (so Playwright can find things by role)

Tests locate elements with `getByRole`, `getByLabel` and `getByText`. Write markup that makes that possible:

- Landmarks: one `<main>`, `<nav aria-label="…">`, `<header>`, `<footer>`. One `<h1>` per page, headings in order.
- Real elements: `<button>` for actions and `<a href>`/`<Link>` for navigation. Never a clickable `<div>`.
- Every input has a `<label>` (or `aria-label`). Errors are in an element with `role="alert"` and tied to the field with `aria-describedby`.
- Status changes (notification arrived, API status) go in `role="status"`.
- Disabled actions use the `disabled` attribute, so `toBeDisabled()` works (US-18 sc.2, US-25 sc.2).
- Do not use `data-testid` unless there is no accessible name. If a role locator is hard to write, fix the markup.
- Works at 390 px wide: no horizontal scroll (NFR-25).

## Tests for the web app

- One test per Gherkin scenario that is `[UI]` or `[CONTENT]`, named `US-xx sc.N <behaviour>`. Rules in `docs/architecture/testing.md`.
- Testing Library queries by role, the same as e2e. Mock only `fetch`, never the api client.
- Journeys across several stories are Playwright specs in `e2e/`, not component tests.
