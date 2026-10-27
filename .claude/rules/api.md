---
paths:
  - "apps/api/**"
---

# API conventions (apps/api)

Sources: ADR-0002, ADR-0005, ADR-0006, ADR-0007, `docs/architecture/api.md`, `domain-model.md`, `data-model.md`.

## A feature is a module: route + service + serializer

Code for one feature lives in `apps/api/src/modules/<module>/` (see `src/modules/README.md`):

- `routes.ts` – HTTP only: the URL, `validateBody(schema)`, call **one** service function, send the serialized result. No Prisma, no rules.
- `service.ts` – the use case. Owns the transaction. Throws `ApiError`. Never touches `req` or `res`.
- `serializer.ts` – turns rows into the JSON of `api.md`. Never returns `passwordHash`, another user's email, or a stored card number.
- `policy.ts` – "may this user do this?" (403). The service calls it before it writes.
- `domain.ts` – pure state machine from `domain-model.md` §3. A status never changes anywhere else.
- `repo.ts` – Prisma queries.
- Register the router in `src/modules/index.ts`. Update `api.md` first if the contract changes.

Validation: use schemas, enums, limits and `splitPrice` from `@ctoc/shared`. Never redefine them here. `validateBody(schema)` replaces `req.body` with the parsed value, so a forged `price` or `status` is already gone when the service runs.

## Errors: only ApiError

```ts
throw new ApiError('TASK_ALREADY_ASSIGNED');
```

- The code must exist in `api.md` §3 (and so in `ERROR_STATUS` in `@ctoc/shared`). The HTTP status comes from the code. Add a new code to `api.md` and regenerate `errors.ts` and `messages.uk.ts` first.
- Never build an error response in a route. The central handler does it. Never leak internals: unexpected errors become 500 `INTERNAL_ERROR`.
- 401 not logged in, 403 known resource but not allowed, 404 resource that the caller must not know about, 409 state conflict or duplicate, 422 business rule on valid input.

## Transactions for state, counters and money (ADR-0007, verbatim)

**Each business action is one interactive transaction** (`prisma.$transaction`) in the module service (ADR-0002). Every check-then-act is a conditional `updateMany` whose `count` is checked: zero changed rows means a conflict (HTTP 409). Never read a row, decide in code and then write it. Keep transactions short, with no network calls or file I/O inside. SQLite serialises writers and the connection URL sets `connection_limit=1` (ADR-0004).

The pattern, used by every action:

```ts
await prisma.$transaction(async (tx) => {
  const moved = await tx.task.updateMany({
    where: { id: taskId, status: 'published', executorId: null },
    data: { status: 'in_progress', executorId: studentId, assignedAt: new Date() },
  });
  if (moved.count === 0) throw new ApiError('TASK_ALREADY_ASSIGNED');
  // …escrow hold, ledger entry, application statuses, notification: same tx
});
```

Also:
- Money is an integer number of kopecks. Commission is `splitPrice(price, rateBp)` from shared, snapshotted on the task at publication.
- Every balance change writes a `ledger_entries` row in the same transaction. A notification is created inside the transaction that causes it.
- Uniqueness and idempotency are database constraints (`data-model.md` §2), not `if` statements. A duplicate request returns the existing result or 409.
- Only the three ports have interfaces: `PaymentProvider`, `Mailer`, `FileStorage`.

## Tests for the API

- One test per Gherkin scenario, named `US-xx sc.N <behaviour>`. Rules in `docs/architecture/testing.md`.
- supertest with the real SQLite test database. `await resetDb()` in `beforeEach`. Use the factories in `tests/helpers/factories.ts`.
- Assert the status, the error `code`, the body shape from `api.md` and the resulting state. No mocked Prisma and no assertions on calls.
- Atomic actions need a rollback test and the race tests from `testing.md` §4. A test named after the invariant (`INV-xx`) for every counter or money rule.
- Test files run serially (shared SQLite file). Never use `.only` or `.skip`.
