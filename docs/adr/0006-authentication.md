# ADR-0006: Cookie sessions, one role per account

**Status:** Proposed
**Date:** 2026-10-27

## Context

The digest found real gaps: no story for customer sign-up (G-01), no rule on dual roles (G-02), no login lifecycle (G-03), no definition of internal roles (G-04), and a state for confirmed users who are not students (G-22). Rules that must hold: a university email alone never grants the Student role (US-08, BR-05); only the owner can accept a result (US-31/S2); only participants see a chat (US-23/S3); only moderators open the panel (US-39/S3).

## Options

| Option | Pros | Cons |
|---|---|---|
| **Server-side sessions in an httpOnly cookie** | Revocable, simple, no token refresh. Works on one origin. | Needs a sessions table and CSRF care. |
| JWT with refresh tokens | Stateless. | Revocation and rotation are on us. Easy to get wrong. |
| Hosted auth (Clerk, Auth0, …) | Less auth code. | External account and limits. Our student-verification flow and roles are custom anyway. |
| Magic links only | No passwords. | Every login depends on email, which is fragile locally. |

## Decision

**Sessions.** Email plus password. Passwords are hashed with `bcryptjs` (pure JavaScript, no native build). A `sessions` table holds random session ids. The cookie is `httpOnly`, `SameSite=Lax`, and `Secure` in production. State-changing requests also pass an `Origin` check as CSRF protection. Rate limits apply to register, login and resend.

**Roles (resolves G-01 to G-04, G-22; assumptions A-01 to A-04, A-25).**
- One role per account: `student`, `customer` or `moderator` (a single internal role covering moderation and admin).
- Sign-up asks "I am a student / I am a customer". Students need an email from a university domain on an allow-list (a static, admin-editable list, A-17). Customers may use any email.
- Both confirm email with the same token flow (US-07). The token is random, stored hashed, and expires after 24 hours.
- Student verification is data, not a role: a `verification_requests` table with the status and the moderator's decision. The «верифікований студент» badge is **derived** from an approved request.
- Moderator accounts are created by the seed or a script, never by self-registration.
- A confirmed `student` without approval can edit a profile, submit documents and read the feed and task details, but cannot apply (US-18/S3). The apply button is visible and answers 403 `STUDENT_NOT_VERIFIED` with a prompt to verify (decision OQ-19).

**Authorization.** Each module has a `policy.ts` with functions such as `canAccept(user, task)`. Services call them and throw 403. A test matrix lists every endpoint against every role with the expected status.

**Email.** A `Mailer` port. Locally it writes to the console and a dev-only outbox page, which also shows confirmation links. A hosted demo can use SMTP from a free provider. Seeded demo accounts are already confirmed.

## Consequences

- **Simpler:** one auth mechanism that the team can reason about. The role model fits one table.
- **Harder:** a person who is both a student and a customer needs a second account (accepted, A-02). The session table must be cleaned of expired rows.
- **Postponed:** password reset (planned to reuse the token mechanism), multi-role accounts, business verification, mobile clients.

No disagreement with `options.md`.

## Related stories

US-06, US-07, US-08, US-09, US-18, US-23, US-31, US-39; digest G-01 to G-04, NFR-07, NFR-08, NFR-12, NFR-13.
