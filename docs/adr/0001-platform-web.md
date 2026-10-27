# ADR-0001: Platform is a responsive web application (React)

**Status:** Proposed
**Date:** 2026-10-27

## Context

The user journey (`requirements.md` §1) starts with public pages (US-01 to US-05) that must work without login, continues through forms, document upload (student card, result files) and an escrow step, and needs a moderator back office (US-39, US-40). Mobile layouts are required (NFR-25), but nothing needs push notifications, camera capture, offline mode or other device APIs.

## Options

| Option | Pros | Cons |
|---|---|---|
| **Responsive web (React)** | One codebase for students, customers and the moderator panel. Public pages and public profile are plain URLs. Any teammate can run it in a browser. | Not installable. Mobile feel depends on CSS. |
| React Native (Expo) | Native feel. | Extra toolchain and a device or emulator per teammate. Public pages and back office still need a web app, so two clients. Slower in 5 weeks. |
| Web now, React Native shell later | Leaves the door open. | Only worth it if the web layer stays a thin UI over an API, which this decision already ensures. |

## Decision

Build a responsive **web** application in React. Mobile browsers are supported through responsive layouts, with no horizontal scroll (NFR-25). React Native is not built in the MVP.

## Consequences

- **Simpler:** one client, one demo format, one deploy, and the moderator panel is the same stack.
- **Harder:** no native niceties (push, home-screen install beyond a basic web app).
- **Postponed:** any mobile client. Because all rules live on the server (ADR-0002), a later client reuses the same API.

## Related stories

US-01 to US-05 (public pages), US-08 and US-27 (uploads), US-39 and US-40 (back office), NFR-25.
