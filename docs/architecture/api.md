# CtoC: API Contract

The contract between `apps/web` and `apps/api`. The style is decided in ADR-0005: REST with JSON under `/api`, a cookie session (ADR-0006), and Zod schemas from `packages/shared`. Entity rules are in [`domain-model.md`](domain-model.md) and cited as INV-xx.

## Conventions

| Topic | Rule |
|---|---|
| Base path | `/api`. Health check: `GET /healthz`. |
| Authentication | `sid` cookie (httpOnly, SameSite=Lax). No session → **401** `AUTH_REQUIRED`. |
| CSRF | A request other than GET that carries the `sid` cookie must send an `Origin` header equal to the web app origin (`APP_URL`). Otherwise **403** `ORIGIN_MISMATCH`. Requests without the cookie cannot act as a user and are not checked (public endpoints). |
| Body | JSON with `camelCase` keys. Unknown keys are **stripped**, so a forged `price` is ignored (US-42/S2). |
| Uploads | `multipart/form-data` with the field `file`. |
| Money | Integer kopecks in fields ending in `Kopecks`. |
| Time | ISO-8601 UTC strings. |
| Ids | Opaque strings (UUID). |
| Lists | Feed and lists use `?cursor=<id>&limit=20`. Chat and notifications use `?after=<id>` for polling. |
| Hidden resources | If a resource exists but the caller may not know it exists, the answer is 404, not 403 (for example an unpublished task in the feed). If the caller knows the resource and lacks rights, the answer is 403 (US-23/S3, US-31/S2, US-39/S3). |

**Access codes:**
- **P**: public.
- **A**: any logged-in user.
- **S-**: student, email confirmed.
- **S+**: verified student.
- **C**: customer.
- **Own**: owner customer of the task.
- **Ex**: executor of the task.
- **M**: moderator.

---

## 1. Endpoints

### Identity and profile

| Method | Path | Stories | Access | Success | Errors |
|---|---|---|---|---|---|
| POST | `/api/auth/register` | US-06, US-43, US-44 | P | 201 (body: §4.5) | 400 `VALIDATION_FAILED`, `EMAIL_DOMAIN_NOT_ALLOWED` · 409 `EMAIL_TAKEN` · 429 |
| POST | `/api/auth/confirm-email` | US-07/S1, S2 | P | 200 (body: §4.6) | 400 `TOKEN_INVALID`, `TOKEN_EXPIRED` |
| POST | `/api/auth/resend-confirmation` | US-07/S3 | P (OQ-20) | 202, no body | 400 `VALIDATION_FAILED` · 409 `EMAIL_ALREADY_CONFIRMED` · 429 |
| POST | `/api/auth/login` | US-45 | P | 200, sets `sid` (body: §4.7) | 400 `VALIDATION_FAILED` · 401 `INVALID_CREDENTIALS` · 429 `RATE_LIMITED` |
| POST | `/api/auth/logout` | US-46 | A | 204 | |
| GET | `/api/me` | US-45 | A | 200 (body: §4.7) | 401 `AUTH_REQUIRED` |
| PUT | `/api/me/profile` | US-11 | S- | 200 (body: §4.11) | 400 `BIO_TOO_LONG`, `VALIDATION_FAILED` · 401 `AUTH_REQUIRED` · 403 `ROLE_FORBIDDEN`, `EMAIL_NOT_CONFIRMED` |
| PUT | `/api/me/skills` | US-10 | S- | 200 (body: §4.10) | 400 `SKILL_EMPTY`, `SKILLS_LIMIT`, `VALIDATION_FAILED` · 401 `AUTH_REQUIRED` · 403 `ROLE_FORBIDDEN`, `EMAIL_NOT_CONFIRMED` |
| GET | `/api/skills?query=` | US-10 | A | 200 (body: §4.10) | 401 `AUTH_REQUIRED` |
| GET | `/api/profiles/:userId` | US-09, US-24, US-37, US-38 | P (A-16) | 200 (body: §4.9), `no-store` | 404 `NOT_FOUND` |
| GET | `/api/public/settings` | US-03, US-15 | P | 200, `Cache-Control: no-store` | |

### Verification

| Method | Path | Stories | Access | Success | Errors |
|---|---|---|---|---|---|
| POST | `/api/me/verification` | US-08 | S- | 201 (body: §4.8) | 400 `FILE_TYPE_NOT_ALLOWED`, `FILE_TOO_LARGE`, `VALIDATION_FAILED` (no file) · 401 `AUTH_REQUIRED` · 403 `EMAIL_NOT_CONFIRMED`, `ROLE_FORBIDDEN` · 409 `VERIFICATION_PENDING`, `ALREADY_VERIFIED` |
| GET | `/api/me/verification` | US-08, US-39/S2 | S- | 200 (body: §4.8) | 401 `AUTH_REQUIRED` · 403 `EMAIL_NOT_CONFIRMED`, `ROLE_FORBIDDEN` |

### Tasks and feed

| Method | Path | Stories | Access | Success | Errors |
|---|---|---|---|---|---|
| GET | `/api/tasks` (feed) | US-12, US-13, US-14, US-15 | S- (any student with a confirmed email) | 200 | 401 · 403 `EMAIL_NOT_CONFIRMED`, `ROLE_FORBIDDEN` |
| GET | `/api/tasks/:id` | US-13, US-15, US-22 | S- (published) · Own · Ex · M | 200 | 404 `NOT_FOUND` |
| POST | `/api/tasks` | US-16, US-17, US-40/S3 | C (confirmed) | 201, always `pending_moderation` | 400 `VALIDATION_FAILED`, `TITLE_TOO_SHORT`, `PRICE_BELOW_MIN`, `PRICE_ABOVE_MAX`, `DEADLINE_IN_PAST` · 403 `ROLE_FORBIDDEN` |
| GET | `/api/my/tasks` | US-50 | C | 200 (each task with `applicationsCount`) | |
| DELETE | `/api/tasks/:id` | US-22/S2, US-50, A-08 | Own | 204 | 403 `NOT_TASK_OWNER` · 409 `TASK_HAS_EXECUTOR` |

### Applications and executor selection

| Method | Path | Stories | Access | Success | Errors |
|---|---|---|---|---|---|
| POST | `/api/tasks/:id/applications` | US-18, US-19, US-42 | S+ | 201 | 400 `NOTE_TOO_LONG` · 403 `STUDENT_NOT_VERIFIED` · 404 `NOT_FOUND` (not published) · 409 `ALREADY_APPLIED`, `TASK_NOT_OPEN` |
| GET | `/api/me/applications` | US-20 | S- | 200 | |
| GET | `/api/tasks/:id/applications` | US-24, US-25 | Own | 200 | 403 `NOT_TASK_OWNER` |
| POST | `/api/tasks/:id/applications/:appId/reject` | US-20/S3 | Own | 200 | 403 · 409 `APPLICATION_NOT_PENDING` |
| POST | `/api/tasks/:id/assign` | US-25, US-26, US-21 | Own | 200 | 403 `NOT_TASK_OWNER` · 404 `NOT_FOUND` (application) · 409 `TASK_ALREADY_ASSIGNED`, `TASK_NOT_OPEN` · 422 `INSUFFICIENT_FUNDS` |

### Delivery and acceptance

| Method | Path | Stories | Access | Success | Errors |
|---|---|---|---|---|---|
| GET | `/api/me/work` | US-22, US-29 | S+ (executor) | 200: the student's tasks as executor, with status | |
| POST | `/api/tasks/:id/result/files` | US-27 | Ex | 201 | 400 `FILE_TYPE_NOT_ALLOWED`, `FILE_TOO_LARGE`, `TOO_MANY_FILES` · 403 `NOT_EXECUTOR` · 409 `RESULT_LOCKED` |
| DELETE | `/api/tasks/:id/result/files/:fileId` | US-29/S3 | Ex | 204 | 403 · 409 `RESULT_LOCKED` |
| POST | `/api/tasks/:id/result/submit` | US-28, US-29, US-32/S1 | Ex | 200 | 403 `NOT_EXECUTOR` · 409 `NO_RESULT_FILES`, `ALREADY_IN_REVIEW`, `INVALID_TRANSITION` |
| POST | `/api/tasks/:id/accept` | US-31, US-30, US-34, US-37 | Own | 200 | 403 `NOT_TASK_OWNER` · 409 `TASK_ALREADY_DONE`, `TASK_NOT_IN_REVIEW` |
| POST | `/api/tasks/:id/return` | US-32, US-33 | Own | 200 | 400 `COMMENT_REQUIRED`, `COMMENT_TOO_LONG` · 403 · 409 `TASK_ALREADY_DONE`, `TASK_NOT_IN_REVIEW` |
| GET | `/api/files/:fileId` | US-27, US-31, US-39 | File owner · Own · Ex · M | 200, `attachment` | 403 `FILE_FORBIDDEN` · 404 |

### Chat and notifications

| Method | Path | Stories | Access | Success | Errors |
|---|---|---|---|---|---|
| GET | `/api/tasks/:id/messages?after=` | US-23 | Own · Ex | 200 | 403 `NOT_CHAT_PARTICIPANT` |
| POST | `/api/tasks/:id/messages` | US-23 | Own · Ex | 201 | 400 `MESSAGE_EMPTY`, `MESSAGE_TOO_LONG` · 403 `NOT_CHAT_PARTICIPANT` · 409 `CHAT_CLOSED` |
| GET | `/api/me/notifications?after=` | US-21, US-30, US-47, US-48, US-49 | A | 200 | |
| POST | `/api/me/notifications/:id/read` | US-21/S3 | A (recipient) | 204 | 404 |

### Payments

| Method | Path | Stories | Access | Success | Errors |
|---|---|---|---|---|---|
| GET | `/api/me/balance` | US-34 | S+ · C | 200 | |
| GET | `/api/me/finance` | US-35 | S+ | 200 | |
| POST | `/api/me/balance/sandbox-topup` | US-26 (OQ-09) | C | 200 | 400 `VALIDATION_FAILED` |
| POST | `/api/me/withdrawals` | US-36 | S+ | 201 | 400 `CARD_INVALID` · 422 `INSUFFICIENT_BALANCE` |
| GET | `/api/me/withdrawals` | US-36 | S+ | 200 | |

### Moderation and admin

All return 401 without a session and **403 `ROLE_FORBIDDEN`** for non-moderators (US-39/S3).

| Method | Path | Stories | Success | Errors |
|---|---|---|---|---|
| GET | `/api/mod/verifications?status=pending` | US-39 | 200 | |
| POST | `/api/mod/verifications/:id/approve` | US-39/S1, US-09 | 200 | 409 `ALREADY_DECIDED` |
| POST | `/api/mod/verifications/:id/reject` | US-39/S2, US-41/S2 | 200 | 400 `REASON_REQUIRED` · 409 `ALREADY_DECIDED` |
| POST | `/api/mod/users/:id/revoke-student` | A-18 | 200 | 409 `INVALID_TRANSITION` |
| GET | `/api/mod/tasks?status=pending_moderation` | US-40 | 200 | |
| POST | `/api/mod/tasks/:id/publish` | US-40/S1 | 200 | 409 `ALREADY_DECIDED` |
| POST | `/api/mod/tasks/:id/reject` | US-40/S2, US-15/S2 | 200 | 400 `REASON_REQUIRED` · 409 `ALREADY_DECIDED`, `TASK_HAS_EXECUTOR` |
| POST | `/api/mod/tasks/:id/resolve` (`release` \| `refund`) | A-09 (OQ-08) | 200 | 409 `INVALID_TRANSITION` |
| GET | `/api/mod/withdrawals?status=requested` | A-10 (OQ-10) | 200 | |
| POST | `/api/mod/withdrawals/:id/mark-paid` and `/reject` | A-10 | 200 | 409 `ALREADY_DECIDED` |
| GET, PUT | `/api/mod/settings` | US-03/S3, US-17 | 200 | 400 `VALIDATION_FAILED` |
| GET, POST, DELETE | `/api/mod/university-domains` | A-17 | 200, 201, 204 | 409 `DOMAIN_EXISTS` |

### Development only

| Method | Path | Purpose | Access |
|---|---|---|---|
| GET | `/api/dev/outbox` | Shows sent emails and confirmation links (ADR-0006) | Only when `NODE_ENV !== 'production'`. Returns 404 otherwise. |

---

## 2. Error format

One shape for every error (ADR-0005):

```json
{
  "error": {
    "code": "PRICE_BELOW_MIN",
    "message": "Мінімальна вартість завдання — 50 грн",
    "details": [{ "field": "priceKopecks", "code": "PRICE_BELOW_MIN" }]
  }
}
```

- `code` is stable. **The UI keys its behaviour and text on `code`**, not on `message`.
- `message` is a Ukrainian default from `messages.uk.ts`, the same file the UI uses.
- `details` is present only for 400 errors, one entry per invalid field.

## 3. Error code dictionary

Messages marked **[AC]** are quoted from a Gherkin scenario and must match exactly. The others are proposed.

| HTTP | Code | When | Message (uk) | Source |
|---|---|---|---|---|
| 400 | `VALIDATION_FAILED` | Generic schema failure. `details` lists the fields. | «Перевірте правильність заповнення полів» | US-16/S2, US-17/S3 |
| 400 | `EMAIL_DOMAIN_NOT_ALLOWED` | A student email is not on the university allow-list. | **[AC]** «Дозволено реєстрацію лише з використанням університетської електронної пошти» | US-06/S2 |
| 400 | `TOKEN_INVALID` | Unknown or used confirmation token. | «Посилання недійсне» | US-07 |
| 400 | `TOKEN_EXPIRED` | Token older than 24 h. The UI offers a resend. | «Термін дії посилання минув. Надіслати лист повторно?» | US-07/S2 |
| 400 | `FILE_TYPE_NOT_ALLOWED` | Document not JPG/PNG/PDF, or result is an executable. | «Дозволено лише зображення або PDF» (documents) · «Цей тип файлу заборонено з міркувань безпеки» (results) | US-08/S2, US-27/S2 |
| 400 | `FILE_TOO_LARGE` | Over 10 MB (document) or 50 MB (result). | **[AC]** «Файл занадто великий. Максимальний розмір — 10 МБ» (50 МБ for results) | US-08/S3, US-27/S3 |
| 400 | `TOO_MANY_FILES` | More than 10 files in one result version. | «Забагато файлів у результаті» | domain-model [prop] |
| 400 | `SKILL_EMPTY` | Empty skill. | «Навичка не може бути порожньою» | US-10/S2 |
| 400 | `SKILLS_LIMIT` | More than 20 skills. | «Досягнуто ліміту навичок (20)» | US-10/S3 |
| 400 | `BIO_TOO_LONG` | Bio over 500 characters. | «Текст «Про мене» перевищує 500 символів» | US-11/S2 |
| 400 | `TITLE_TOO_SHORT` | Title under 5 characters. | «Назва занадто коротка» | US-16/S3 |
| 400 | `PRICE_BELOW_MIN` | Price below the minimum. | «Мінімальна вартість завдання — 50 грн» | US-17/S2 |
| 400 | `PRICE_ABOVE_MAX` | Price above the maximum. | «Ціна перевищує допустимий ліміт» | US-17/CL |
| 400 | `DEADLINE_IN_PAST` | Deadline not in the future. | «Строк має бути в майбутньому» | domain-model [prop] |
| 400 | `NOTE_TOO_LONG` | Note over 500 characters. | «Записка перевищує допустиму довжину» | US-19/S2 |
| 400 | `COMMENT_REQUIRED` | Return without a comment. | **[AC]** «Коментар до доопрацювання є обов'язковим» | US-32/S3, US-33/S2 |
| 400 | `COMMENT_TOO_LONG` | Comment over 2000 characters. | «Коментар перевищує допустиму довжину» | US-33/S3 |
| 400 | `MESSAGE_EMPTY` | Empty chat message. | «Повідомлення не може бути порожнім» | US-23/S2 |
| 400 | `MESSAGE_TOO_LONG` | Message over 2000 characters. | «Повідомлення занадто довге» | domain-model [prop] |
| 400 | `REASON_REQUIRED` | Moderator rejection without a reason. | «Вкажіть причину відхилення» | US-39/S2, US-40/S2 |
| 400 | `CARD_INVALID` | Not 16 digits, or the Luhn check fails. | «Невірний формат української банківської картки» | US-36/S2 |
| 401 | `AUTH_REQUIRED` | No or expired session. The UI redirects to `/login`. | «Увійдіть, щоб продовжити» | US-12/S3 |
| 401 | `INVALID_CREDENTIALS` | Wrong email or password. | «Невірна пошта або пароль» | US-45/S2 |
| 403 | `ROLE_FORBIDDEN` | Wrong role for the endpoint (for example a student opening `/api/mod/*`). | «Доступ заборонено» | US-39/S3 |
| 403 | `ORIGIN_MISMATCH` | CSRF check failed. | «Доступ заборонено» | ADR-0006 |
| 403 | `EMAIL_NOT_CONFIRMED` | Action needs a confirmed email. | «Спершу підтвердіть пошту» | US-08/S1 |
| 403 | `STUDENT_NOT_VERIFIED` | Action needs a verified student. The UI links to `/me/verification`. | «Завершіть верифікацію статусу студента» | US-18/S3 |
| 403 | `NOT_TASK_OWNER` | Not the customer who owns the task. | «Доступ заборонено» | US-31/S2 |
| 403 | `NOT_EXECUTOR` | Not the executor of the task. | «Доступ заборонено» | US-27 |
| 403 | `NOT_CHAT_PARTICIPANT` | Neither the owner nor the executor. | «Доступ заборонено» | US-23/S3 |
| 403 | `FILE_FORBIDDEN` | No right to download the file. | «Доступ заборонено» | NFR-07 |
| 404 | `NOT_FOUND` | The resource does not exist or must not be revealed. | «Не знайдено» | US-14 |
| 409 | `EMAIL_TAKEN` | Email already registered. | **[AC]** «Ця електронна пошта вже використовується» | US-06/S3 |
| 409 | `EMAIL_ALREADY_CONFIRMED` | Resend after confirmation. | «Пошту вже підтверджено» | US-07 |
| 409 | `VERIFICATION_PENDING` | A request is already waiting. | «Ваш документ уже очікує перевірки» | INV-04 |
| 409 | `ALREADY_VERIFIED` | Already a verified student. | «Статус студента вже підтверджено» | US-08 |
| 409 | `ALREADY_APPLIED` | Second application to the same task. | **[AC]** «Ви вже подали відгук на це завдання» | US-18/S2 |
| 409 | `TASK_NOT_OPEN` | Task is not `published`, or already has an executor. | «Завдання вже недоступне для відгуків» | US-18/S1 |
| 409 | `TASK_ALREADY_ASSIGNED` | An executor is already selected. | «Виконавця вже обрано» | US-25/S2 |
| 409 | `TASK_HAS_EXECUTOR` | Delete or unpublish after an executor was selected. | «Завдання з виконавцем не можна видалити» | US-22/S2 |
| 409 | `APPLICATION_NOT_PENDING` | The application was already decided. | «Рішення щодо відгуку вже ухвалено» | US-20 |
| 409 | `RESULT_LOCKED` | Changing files of a submitted version. | «Результат на перевірці, редагування заблоковано» | US-29/S3 |
| 409 | `NO_RESULT_FILES` | Submit without files. | «Додайте файл результату» | US-28/S2 |
| 409 | `ALREADY_IN_REVIEW` | Submitting again while in `in_review`. | «Результат уже на перевірці» | US-28/S3 |
| 409 | `TASK_NOT_IN_REVIEW` | Accept or return when not in `in_review`. | «Немає результату на перевірці» | US-32/CL |
| 409 | `TASK_ALREADY_DONE` | Accept or return after `done`. | «Угоду вже завершено» | US-31/S3, US-32/S2 |
| 409 | `CHAT_CLOSED` | Writing after `done` or `cancelled`. | «Чат закрито» | A-20 |
| 409 | `ALREADY_DECIDED` | Second moderator decision. | «Рішення вже ухвалено» | NFR-18 |
| 409 | `DOMAIN_EXISTS` | Duplicate university domain. | «Домен уже є у списку» | A-17 |
| 409 | `INVALID_TRANSITION` | Any other illegal state change. | «Дія недоступна в поточному статусі» | domain-model §3 |
| 422 | `INSUFFICIENT_FUNDS` | Customer balance is below the task price when selecting. Selection is cancelled. | **[AC]** «Недостатньо коштів» | US-26/S2 |
| 422 | `INSUFFICIENT_BALANCE` | Withdrawal above the available balance. | **[AC]** «Недостатньо коштів на балансі для виведення» | US-36/S3 |
| 429 | `RATE_LIMITED` | Too many register, login or resend attempts. | «Забагато спроб. Спробуйте пізніше» | US-45/S3, NFR-13 |
| 500 | `INTERNAL_ERROR` | Unexpected failure. The whole transaction is rolled back, so no notification is sent and no status changes. No internals in the response. | «Щось пішло не так. Спробуйте пізніше» | US-21/S2, US-30/S2, US-34/S2 |

The 422, 429 and 500 codes go beyond the requested 400–409 set. They follow the ADR-0005 status mapping (422 is a business rule with valid input, 429 is a rate limit, 500 is an unexpected failure).

---

## 4. Examples of non-trivial endpoints

### 4.1 `POST /api/tasks/:id/assign` (select executor and reserve funds)

This is one transaction: escrow hold, task `in_progress`, the chosen application `accepted`, the others `rejected`, and a notification (INV-11).

The request carries an idempotency key, so a double-click or retry returns the same result (US-26/S3).

```http
POST /api/tasks/7d0c…/assign
Content-Type: application/json
Idempotency-Key: 3f6a2b1e-…

{ "applicationId": "a91e…" }
```

```json
200 OK
{
  "task": { "id": "7d0c…", "status": "in_progress", "executorId": "u-55…", "priceKopecks": 50000 },
  "escrow": { "id": "e-12…", "status": "held", "amountKopecks": 50000 },
  "applications": { "accepted": "a91e…", "rejectedCount": 3 }
}
```

The customer's sandbox balance is 300 UAH but the price is 500 UAH (US-26/S2). Nothing changes:

```json
422 Unprocessable Entity
{ "error": { "code": "INSUFFICIENT_FUNDS", "message": "Недостатньо коштів" } }
```

Another tab already assigned an executor (US-25/S2):

```json
409 Conflict
{ "error": { "code": "TASK_ALREADY_ASSIGNED", "message": "Виконавця вже обрано" } }
```

### 4.2 `POST /api/tasks/:id/accept` (accept result)

This is one transaction (INV-18). Calling it again returns 409 and does **not** credit twice (US-31/S3, US-34/S3).

```http
POST /api/tasks/7d0c…/accept
Content-Type: application/json

{}
```

```json
200 OK
{
  "task": { "id": "7d0c…", "status": "done", "completedAt": "2026-11-20T14:03:11Z" },
  "payout": { "grossKopecks": 100000, "commissionKopecks": 10000, "netKopecks": 90000 },
  "experienceRecordId": "x-41…"
}
```

A user who is not the owner calls it (US-31/S2):

```json
403 Forbidden
{ "error": { "code": "NOT_TASK_OWNER", "message": "Доступ заборонено" } }
```

### 4.3 `POST /api/tasks/:id/applications` with a forged price

The schema has no `price` field, so it is stripped. The application uses the customer's price (US-42/S2, US-13/S2).

```http
POST /api/tasks/7d0c…/applications
Content-Type: application/json

{ "note": "Маю досвід у подібних лабораторних роботах", "priceKopecks": 100 }
```

```json
201 Created
{ "application": { "id": "a91e…", "taskId": "7d0c…", "status": "sent",
                   "note": "Маю досвід у подібних лабораторних роботах",
                   "createdAt": "2026-11-12T09:15:00Z" } }
```

A second call (US-18/S2):

```json
409 Conflict
{ "error": { "code": "ALREADY_APPLIED", "message": "Ви вже подали відгук на це завдання" } }
```

### 4.4 `POST /api/tasks` (create task, with field-level validation)

```http
POST /api/tasks
Content-Type: application/json

{ "title": "A", "description": "", "priceKopecks": 2000,
  "deadlineAt": "2026-12-01T18:00:00Z", "status": "published" }
```

```json
400 Bad Request
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Перевірте правильність заповнення полів",
    "details": [
      { "field": "title", "code": "TITLE_TOO_SHORT" },
      { "field": "description", "code": "VALIDATION_FAILED" },
      { "field": "priceKopecks", "code": "PRICE_BELOW_MIN" }
    ]
  }
}
```

The `status` field is stripped. A valid request always creates a task in `pending_moderation` (US-40/S3, INV-05).

### 4.5 `POST /api/auth/register` (US-06, US-43)

```json
{ "role": "student", "email": "user@knu.edu.ua", "displayName": "Олена Коваль", "password": "secret-pass" }
```

201. No session is created; the user logs in after confirming the email (US-07). The email is not echoed back.

```json
{ "user": { "id": "…", "role": "student", "displayName": "Олена Коваль", "emailConfirmed": false } }
```

- A student email must pass two checks: the `.edu.ua` suffix (shared schema) and a domain listed in `university_domains` (A-17). Both fail with 400 `EMAIL_DOMAIN_NOT_ALLOWED` and `details: [{ "field": "email", … }]`.
- A repeated email, in any letter case, gives 409 `EMAIL_TAKEN` (INV-01, unique NOCASE index).
- Rate limit: 10 requests per hour per IP, then 429 `RATE_LIMITED` (proposal).
- The confirmation email goes through the `Mailer` port. A failed send does not fail the registration.

### 4.6 `POST /api/auth/confirm-email` and `POST /api/auth/resend-confirmation` (US-07)

```json
{ "token": "…token from the emailed link…" }
```

200, and the account is confirmed. No session is created.

```json
{ "user": { "id": "…", "role": "student", "displayName": "Олена Коваль", "emailConfirmed": true } }
```

- A token works once. An unknown, used or replaced token gives 400 `TOKEN_INVALID`. A token past its 24 h lifetime that was never used gives 400 `TOKEN_EXPIRED`, and the UI offers a resend.
- Resend takes `{ "email": "user@knu.edu.ua" }` and answers 202 with no body. It stores a new token, invalidates the older unused ones and sends a new email (the dev outbox shows it). An unknown email also gets 202 and nothing is sent. A confirmed account gets 409 `EMAIL_ALREADY_CONFIRMED`. Limit: 5 requests per hour per IP, then 429 `RATE_LIMITED` (proposal). Public access is open question OQ-20.

### 4.7 `POST /api/auth/login` and `GET /api/me` (US-45)

```json
{ "email": "user@knu.edu.ua", "password": "secret-pass" }
```

200, with `Set-Cookie: sid=…; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800` (`Secure` in production). The session lasts 7 days and is not renewed. `GET /api/me` returns the same body for a valid cookie, and 401 `AUTH_REQUIRED` for no, unknown or expired cookie.

```json
{ "user": { "id": "…", "role": "student", "displayName": "Олена Коваль", "emailConfirmed": true, "studentVerified": false } }
```

- A wrong password and an unknown email give the identical 401 `INVALID_CREDENTIALS` («Невірна пошта або пароль»). An unknown email still runs a password comparison, so the timing is similar.
- A user with an unconfirmed email can log in (`emailConfirmed: false`). The UI then offers only the resend of the confirmation email.
- Only the SHA-256 of the cookie value is stored in `sessions.id`.
- Limit: 5 failed logins per 15 minutes per IP, then 429 `RATE_LIMITED` even for a correct password. Successful logins are not counted and reset the count (proposal, in memory, single API instance).
- The start page by role is decided by the web app: student → `/feed`, customer → `/c/tasks`, moderator → `/mod/verifications`.
- Moderators are created by `pnpm db:seed` (`SEED_MODERATOR_EMAIL`, `SEED_MODERATOR_PASSWORD`), never by registration (ADR-0006).

### 4.8 `POST /api/me/verification` and `GET /api/me/verification` (US-08)

`POST` is `multipart/form-data` with one field `file`. The type is detected from the **content** (JPEG, PNG or PDF), not from the name or the browser's content type, so a renamed `.exe` is rejected. The limit is 10 MB: exactly 10 MB is accepted, one byte more gives 400 `FILE_TOO_LARGE`. Both errors carry `details: [{ "field": "file", … }]` and store nothing.

201, and the same shape is returned by `GET` (`{ "verification": null }` before the first upload):

```json
{ "verification": { "id": "…", "status": "pending", "label": "Очікує перевірки", "reason": null, "createdAt": "2026-11-10T10:00:00.000Z", "decidedAt": null } }
```

- The label «Очікує перевірки» follows decision W-14. `reason` is filled only for a rejected request. The file and the moderator are never returned.
- Uploading never grants the student role or the badge: `studentVerifiedAt` is set only by a moderator approving the request (INV-03).
- At most one request per student is `pending` (INV-04, partial unique index): a second upload gives 409 `VERIFICATION_PENDING`. After a rejection or a revocation the student may upload again.
- Access: a student with a confirmed email. No session gives 401, a customer or moderator 403 `ROLE_FORBIDDEN`, an unconfirmed email 403 `EMAIL_NOT_CONFIRMED`, an already verified student 409 `ALREADY_VERIFIED`.
- Files are stored through the `FileStorage` port (local disk, `apps/api/data/uploads`, or `UPLOAD_DIR`) under a random key, and are never served as static files. Downloading is for the moderator (US-39).

### 4.9 `GET /api/profiles/:userId` (US-09)

Public, no session needed. `Cache-Control: no-store`, so a badge granted by a moderator shows on the next request.

```json
{ "profile": { "id": "…", "displayName": "Олена Коваль", "verified": true, "skills": ["HTML", "Java"], "bio": "Студент 2 курсу…" } }
```

- `verified` is `studentVerifiedAt IS NOT NULL` and nothing else (INV-03). A student who has not uploaded a document, or whose request is pending or rejected, has `verified: false`.
- Every **student** account has a profile, including one with an unconfirmed email. A missing id, a customer and a moderator all give the same 404 `NOT_FOUND`, so the URL does not reveal which accounts exist.
- The email, the role and the hash are never returned. `skills` is the list from US-10 (alphabetical, `[]` when empty). `bio` is the «Про мене» text from US-11 (`""` when empty), shown as plain text. Experience records are added to this body by US-37 and US-38.
- The only way to become verified is a moderator approving the request (US-39/S1). Until that endpoint exists, `studentVerifiedAt` can only be set in the database.

### 4.10 `PUT /api/me/skills` and `GET /api/skills` (US-10)

```json
{ "skills": ["Java", "HTML"] }
```

200, with the saved set, alphabetical (Ukrainian collation, so Cyrillic names come before Latin ones):

```json
{ "skills": ["HTML", "Java"] }
```

- `PUT` **replaces the whole set** in one transaction, so it is repeatable, and `[]` clears it. Each name reuses the existing skill ignoring case (ASCII only, a SQLite limit) or creates one outside the catalogue (`in_catalog = 0`). A failure leaves the previous set unchanged.
- Rules (shared schema): each skill is trimmed and 1–40 characters, at most 20 skills, no duplicates ignoring case. An empty skill gives 400 `SKILL_EMPTY`, more than 20 gives 400 `SKILLS_LIMIT`, anything else invalid gives 400 `VALIDATION_FAILED`.
- Access: a student with a confirmed email (no session 401, other roles 403 `ROLE_FORBIDDEN`, unconfirmed 403 `EMAIL_NOT_CONFIRMED`).
- `GET /api/skills?query=` returns `{ "skills": ["Java", "JavaScript"] }`: catalogue skills only, containing `query` ignoring case, sorted, at most 20. Any logged-in user may call it. The catalogue is seeded by a migration (20 skills) and is not extended by students' own skills.
- There is no "get my skills" endpoint: the editor reads `GET /api/me` and then `GET /api/profiles/:id` (§4.9).

### 4.11 `PUT /api/me/profile` (US-11)

```json
{ "bio": "Люблю код 💻, дизайн 🎨 і каву ☕!" }
```

200, with the saved text:

```json
{ "bio": "Люблю код 💻, дизайн 🎨 і каву ☕!" }
```

- The text is stored **exactly as typed**: no trimming, line breaks and emoji unchanged (stored as UTF-8). `""` clears it. The first save creates the profile row, later saves update it (one atomic upsert).
- The limit is 500 **characters, counted as Unicode code points**, the same way as the database CHECK `length(bio) <= 500`. So 500 emoji are accepted (1000 UTF-16 units) and 501 give 400 `BIO_TOO_LONG` («Текст «Про мене» перевищує 500 символів»). A missing or non-string `bio` gives 400 `VALIDATION_FAILED`.
- Access: a student with a confirmed email (no session 401, other roles 403 `ROLE_FORBIDDEN`, unconfirmed 403 `EMAIL_NOT_CONFIRMED`). A student can only change their own bio. The body has no user id.
- The web form shows a live counter and blocks the save over the limit. It never cuts the text off.
