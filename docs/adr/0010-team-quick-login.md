# ADR-0010: Team quick login to the demo accounts with a server-side code

- Status: Proposed
- Date: 2026-11-26
- Relates to: ADR-0006 (authentication), ADR-0009 (deployment)

## Context

The team and the reviewers open the demo many times a day, often from a phone. Typing the email and password of the demo
student, customer and moderator each time slows every check. The demo money is simulated, but the moderator can approve
student documents and mark payouts, so the shortcut must not be open to anyone who reads the page source.

## Decision

- A «?» «Для команди» under the login form asks for a team code. After the right code, three buttons open the demo
  student, customer and moderator with one tap.
- The code lives only in the server environment as `TEAM_LOGIN_CODE`. With no code set, the endpoints answer 404 and the
  web app hides the «?». The code is never sent to the browser.
- The server compares the code in constant time and allows 5 wrong codes per 15 minutes per IP, like the login.
- The accounts are the existing demo accounts, found by email (`TEAM_LOGIN_*_EMAIL`, defaults are the seed accounts). No
  account is created by this feature. A session is the same `sid` session as after a normal login.

## Consequences

- Anyone who knows the code is the demo moderator. A short code such as four digits can be guessed in a few hours even with
  the limit, so on a public deployment the code should be long, or the variable should be unset once the demo is over.
- Removing the feature is one line: unset `TEAM_LOGIN_CODE`.
- Real users' accounts are never reachable this way, because only the configured demo emails can be opened.
