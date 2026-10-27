# ADR-0005: Express 5, Zod, REST, stable error codes, polling

**Status:** Proposed
**Date:** 2026-10-27

## Context

The scenarios talk in HTTP terms: 403 for non-participants (US-23/S3, US-31/S2, US-39/S3), "malicious API request" with a forged price (US-13/S2, US-42/S2), and bypass of moderation through the API (US-40/S3). They specify exact Ukrainian error strings. Chat must feel instant (US-23/S1) and notifications must appear promptly (US-21/S1).

## Options

| Concern | Options | Trade-off |
|---|---|---|
| Framework | **Express 5** · Fastify · NestJS · Hono | Express is the best known and documented, and handles async errors natively. NestJS has structure but a steep learning curve. |
| API style | **REST + shared Zod** · tRPC · GraphQL | tRPC is awkward for file upload and for the explicit 403/409 behaviour in the scenarios. GraphQL is overkill. |
| Error format | **`{error:{code,message,details?}}`** · RFC 7807 | Stable codes let the UI show the exact Ukrainian wording. 7807 adds URLs we do not need. |
| Real-time | **Polling** · SSE · WebSocket | Polling works on any free host. SSE and WebSocket are more fragile there and need more code. |

## Decision

- **Framework:** Express 5 with the module layout from ADR-0002.
- **Validation:** Zod schemas from `packages/shared`, applied by one middleware (`validate({params, query, body})`). Unknown fields in bodies are stripped, so a forged `price` on an application is ignored (US-42/S2).
- **API style:** REST over JSON under `/api`. Resources follow the modules (`/api/tasks`, `/api/tasks/:id/applications`, …). Uploads use `multipart/form-data` handled by one upload middleware.
- **Error format:** `{ "error": { "code": "TASK_ALREADY_ASSIGNED", "message": "…", "details": [] } }`. Status mapping: 400 validation, 401 not logged in, 403 not allowed, 404 not found (also used where existence must not leak), 409 state conflict or duplicate, 422 business rule. The server returns codes. The Ukrainian texts live in `messages.uk.ts` in the shared package.
- **One central error handler.** Services throw typed errors and routes never build error responses by hand.
- **Real-time:** polling with an `after=<id>` cursor. Chat polls every few seconds while open, and notifications poll more slowly. "Миттєво" is read as "within a few seconds" (see digest NFR-22).

## Consequences

- **Simpler:** one familiar framework. The same schema validates the form and the request. Every error looks the same.
- **Harder:** polling adds request volume and up to a few seconds of latency. The module-boundary rules rely on convention, not on the framework.
- **Postponed:** SSE or WebSocket (the `after` cursor makes the switch local to chat and notifications). No generated API docs in the MVP.

No disagreement with `options.md`.

## Related stories

US-13, US-21, US-23, US-30, US-31, US-39, US-40, US-42; NFR-06, NFR-07, NFR-22.
