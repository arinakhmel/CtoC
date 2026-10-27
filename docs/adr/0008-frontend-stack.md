# ADR-0008: Vite, React Router, TanStack Query, react-hook-form, Tailwind

**Status:** Proposed
**Date:** 2026-10-27

## Context

The frontend is a set of forms and lists with statuses that must stay correct after refresh (US-09/S3, US-20/S2, US-29/S2), polling for chat and notifications (ADR-0005), mobile layouts (NFR-25), and Ukrainian-only text (OOS). SEO is not required for the MVP. The team has basic React skills.

## Options

| Concern | Options | Trade-off |
|---|---|---|
| App model | **Vite SPA** · Next.js | Next.js adds a server/client split and a second runtime. SEO is not needed now. |
| Routing | **React Router** · TanStack Router | React Router has the most documentation. |
| Server data | **TanStack Query** · SWR · manual `fetch` | Query gives caching, refetch on focus and `refetchInterval` for polling. |
| Forms | **react-hook-form + shared Zod** · hand-rolled | One schema on client and server. |
| Styles | **Tailwind** · CSS Modules · MUI | Tailwind is fast, mobile breakpoints are built in. A component kit costs bundle size and fights customisation. |

## Decision

- Vite + React + TypeScript single-page app, in `apps/web`.
- React Router, with route guards that read the current user and role (ADR-0006). Public routes: landing, info pages, public profile.
- TanStack Query for all server data. Mutations invalidate related queries. Chat and notifications use `refetchInterval`.
- react-hook-form with the Zod schemas from `packages/shared`. Server error `code`s map to Ukrainian text in `messages.uk.ts`.
- Tailwind CSS, mobile-first. No component library. Small shared primitives live in `ui/` (button, input, badge, status label).
- Dates are stored in UTC and rendered with `Intl` in the user's local time zone (US-22/S3).
- Fonts and icons are bundled, not loaded from a CDN, so the demo works offline.
- Tests: Vitest for logic. One end-to-end happy path (journey steps 1 to 7) is a nice-to-have if time allows.
- In dev, Vite proxies `/api` to the backend, so cookies work on one origin.

## Consequences

- **Simpler:** few concepts, all well documented. Polling and cache invalidation come from one library.
- **Harder:** no server rendering, so the landing and public profile are not SEO-optimised. Tailwind class lists need a shared set of `ui/` components to stay consistent.
- **Postponed:** SEO, prerendering, i18n framework, design system.

No disagreement with `options.md`.

## Related stories

US-01 to US-05, US-09, US-12, US-20, US-22, US-23, US-29; NFR-22, NFR-24 to NFR-28.
