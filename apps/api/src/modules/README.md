# modules/

One folder per business module (ADR-0002): `identity`, `verification`, `tasks`, `applications`,
`payments`, `delivery`, `chat`, `notifications`, `experience`, `admin`. The skeleton has none yet.

Every module has the same files. A story adds or changes files in **one** module:

| File | What goes there | What must not |
|---|---|---|
| `routes.ts` | Express router: URL, `validateBody(schema)`, call the service, send the result | business rules, Prisma calls |
| `serializer.ts` | Turns database rows into the JSON in `api.md` (never leaks `passwordHash`, emails, card numbers) | queries |
| `service.ts` | Use cases. Owns the `prisma.$transaction` (ADR-0007) and throws `ApiError` | `req`/`res` |
| `policy.ts` | "May this user do this?" functions used by the service (403) | queries beyond what the check needs |
| `domain.ts` | Pure state machines from `domain-model.md` §3 (`transition(state, event)`) | I/O |
| `repo.ts` | Prisma queries used by the service | rules |
| `*.test.ts` or `tests/<module>/` | One test per Gherkin scenario, named `US-xx sc.N` | |

Rules in short:
- Validation schemas, enums, limits and money helpers come from `@ctoc/shared`. Do not redefine them.
- A service calls another module only through that module's service, inside the caller's transaction.
- Register the router in `index.ts`.
- Errors: `throw new ApiError('CODE')`. The code must exist in `api.md` §3.

Full rules: `.claude/rules/api.md` and `docs/adr/`.
