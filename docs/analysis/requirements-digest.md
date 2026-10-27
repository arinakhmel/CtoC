# CtoC MVP: Requirements Digest

> **Purpose.** This is input for the design phase. It analyses the requirements as written. It makes no design decisions and picks no technologies.
>
> **Sources analysed**
> - `docs/requirements.md`: user journey (§1), scope (§2), 42 user stories (§3), and acceptance criteria with a checklist and 3 Gherkin scenarios per story (§4). This is the primary source.
> - `docs/presentation_practice_3.md`: the spoken summary of the same material. It adds no new requirements.
> - `README.md`: personas, value propositions and the "Ризики та рішення" (risks and solutions) section. It is a secondary source, cited only where it adds a rule the stories rely on.
>
> **Reference conventions**
> - `US-xx` is a user story. `US-xx/CL` is its checklist ("Чек-лист").
> - `US-xx/S1` is Scenario 1 (Happy Path). `US-xx/S2` is Scenario 2 (Edge Case 1). `US-xx/S3` is Scenario 3 (Edge Case 2).
> - `J-n` is step *n* of the user journey in `requirements.md` §1. `OOS` is the Out of Scope list in §2.
> - The requirements are in Ukrainian. Status labels, UI labels and system messages are quoted **verbatim in Ukrainian** («…») with an English gloss, because they are exact strings the design must reproduce. Other quotes are literal translations in "double quotes".
> - Values introduced in the source with "наприклад" ("for example") are marked *(example value)*. They are not confirmed requirements; see §4 and §5.

---

## 1. Entities and their states

### 1.0 Actors and roles

| Actor | How the requirements name it | Where it appears | Notes |
|---|---|---|---|
| Anonymous visitor | "неавторизований / незареєстрований користувач", "відвідувач", "потенційний користувач" (unauthorised / unregistered user, visitor, potential user) | US-01…US-05, US-12/S3 | May read only the public landing and info pages. |
| Registered user, email not confirmed | account status «Непідтверджений» ("Unconfirmed"), "неактивний акаунт" ("inactive account") | US-06/CL, US-06/S1 | |
| Registered user, email confirmed, no student role | "зареєстрований користувач із підтвердженою поштою" ("registered user with a confirmed email") | US-08/S1 | Teachers and staff with university mail stay in this state permanently (US-08, US-39/S1). |
| Verified student (role «Студент», "Student") | "верифікований студент" ("verified student") | US-08/CL, US-09, US-18/S1, US-39/S1 | The only actor that may apply to tasks (US-18/S3). |
| Customer (замовник) | "авторизований замовник" ("authorised customer") | US-16/S1, US-17, US-24…US-26, US-31…US-33 | **No story says how a customer registers or authenticates** (see G-01). |
| Platform team member / moderator / administrator | "член команди платформи", "модератор", "адміністратор" | US-03/S3 ("в бекофісі", "in the back office"), US-08/CL, US-09/S1, US-39, US-40 | Three names are used. It is not stated whether they are one role or several (see G-04). |
| Payment gateway / external system | "платіжний шлюз", "системний вебхук" ("payment gateway", "system webhook") | US-26/S2, US-34/S2, US-34/S3 | An external actor implied by the payment scenarios. |
| QA engineer / auditor | "QA-інженер", "аудит безпеки" ("security audit") | US-04/S2, US-41/S3 | Acceptance-only actors. Not system users. |
| Excluded actors | agencies, seniors, teachers, staff | US-01, US-08, US-39, US-41, OOS | Must never obtain the Student role. |

---

### 1.1 User Account

**Attributes stated in the requirements**
- `email`, which must be a university email (US-06/CL "Валідація пошти перевіряє наявність академічного домену" ("email validation checks for an academic domain"); US-06/S1 example `user@university.edu.ua`). It is unique (US-06/S3).
- `password` (US-06/S1 "вводить дійсний університетський email … та пароль", "enters a valid university email … and a password").
- `account status`: «Непідтверджений» ("Unconfirmed") at creation (US-06/S1). The account is "неактивний" ("inactive") at creation (US-06/CL).
- `email status`: becomes «Підтверджено» ("Confirmed") (US-07/CL).
- `role`: «Студент» ("Student") is assigned "системно лише після схвалення документа адміністратором" ("by the system, only after the document is approved by an administrator") (US-08/CL, US-39/S1). No other role values are named, although a customer and a moderator role clearly exist.
- A login session is implied: "виконує повторний вхід у систему" ("logs in again") (US-09/S3).

**States and transitions**

| # | From | To | Initiator | Condition | Source |
|---|---|---|---|---|---|
| A1 | (none) | «Непідтверджений» (inactive) | Visitor | Email is on a university domain "згідно з довідником" ("according to the directory"). Email not already registered. Password entered. A confirmation email is sent. | US-06/CL, US-06/S1, S2, S3 |
| A2 | «Непідтверджений» | Email «Підтверджено» (active) | User (clicks the link) | Token is valid and not expired (24 h *(example value)*). Redirect to a success page. | US-07/CL, US-07/S1 |
| A3 | «Непідтверджений» | «Непідтверджений» (no change) | User | Token expired. Shows an error and offers to resend. | US-07/S2 |
| A4 | «Непідтверджений» | «Непідтверджений» with a new token | User («Надіслати лист повторно», "Resend email") | The user did not receive or deleted the letter. | US-07/S3 |
| A5 | Email confirmed, no role | Role «Студент» | Moderator («Схвалити», "Approve") | The student-status document is approved. See 1.3. | US-08/CL, US-39/S1 |

Not specified: account blocking or deactivation, deletion, role revocation, password change or reset, and how the customer and moderator roles are assigned.

---

### 1.2 Email Confirmation Token

**Attributes:** "унікальний токен/посилання" ("unique token/link") (US-07/CL). Validity "обмежений час дії (наприклад, 24 години)" ("limited validity, e.g. 24 hours") *(example value)* (US-07/CL).

| # | From | To | Initiator | Condition | Source |
|---|---|---|---|---|---|
| T1 | (none) | Issued | System | On registration (A1) or on resend (A4: "генерує новий токен", "generates a new token"). | US-07/CL, US-07/S3 |
| T2 | Issued | Used | User | Clicked within the validity period. | US-07/S1 |
| T3 | Issued | Expired | Time | More than 24 h passed *(example value)*. | US-07/S2 |

Not specified: whether a resend invalidates earlier tokens, whether a token is single-use, and whether resends are rate-limited.

---

### 1.3 Student Verification Request (student status document)

**Attributes**
- `document file`: "фото/скан студентського квитка або довідки з університету" ("photo/scan of a student card or a university certificate") (US-08/CL). Format JPG/PNG/PDF (US-08/S1). `.exe` and `.zip` are rejected and "дозволено лише зображення або PDF" ("only images or PDF are allowed") (US-08/S2). Maximum size 10 MB *(example value)* (US-08/S3).
- `status`: named «На перевірці адміністратором» ("Under administrator review") in US-08/CL but «Очікує перевірки» ("Awaiting review") in US-08/S1 (see C-03).
- `rejection reason`: "натискає «Відхилити» і вказує причину" ("clicks «Відхилити» (Reject) and gives a reason") (US-39/S2).
- `submitter`: a user whose email is confirmed (US-08/S1). `reviewer`: a moderator (US-39).

| # | From | To | Initiator | Condition | Source |
|---|---|---|---|---|---|
| V1 | (none) | «Очікує перевірки» / «На перевірці адміністратором» | User with a confirmed email («Надіслати на перевірку», "Submit for review") | Valid format and size | US-08/CL, US-08/S1, S2, S3 |
| V2 | Pending | Approved | Moderator («Схвалити») | The document is genuine. The user gets the «Студент» role and the badge appears "автоматично" ("automatically"). | US-39/S1, US-09/CL, US-09/S1 |
| V3 | Pending | Rejected | Moderator («Відхилити») | Reason required. The user gets a rejection notification. | US-39/S2, US-41/S2 |

Not specified: resubmission after rejection, expiry of student status (for example after graduation), revocation, and how long the document is kept.

---

### 1.4 Student Profile

**Attributes**
- `skills`: "теги/скіли" ("tags/skills"), chosen "зі списку або вводити власні" ("from a list or entered freely") (US-10/CL). An empty skill is rejected (US-10/S2). Maximum 20 *(example value)* (US-10/S3).
- `bio` («Про мене», "About me"): text with a maximum length (US-11/CL), 500 characters *(example value)* (US-11/S1). Emoji and punctuation must be stored "без колізій кодування (UTF-8)" ("without encoding collisions (UTF-8)") (US-11/S3).
- `verified badge`: «верифікований студент» ("verified student"), shown "у шапці профілю" ("in the profile header") (US-09/S1). It is derived from the Student role. It is absent for unverified users (US-09/S2, US-24/S2) and stays after a page refresh or re-login (US-09/S3).
- `experience records`: see 1.15.
- `visibility`: the profile is "публічний" ("public") (US-09/CL, US-10/S1 "публічній картці профілю", "public profile card"). It is viewable by customers (US-24/S1) and by "будь-який користувач" ("any user") (US-38/S1).

**States:** no lifecycle of its own. The badge state follows the Student role (V2).

---

### 1.5 Customer

**Attributes stated:** none explicitly. The only implied ones are:
- a balance or card used to fund escrow: "зі свого балансу/картки" ("from their balance/card") (US-26/S1, US-26/S2);
- ownership of tasks: "своє завдання" ("their own task") (US-24/S1, US-25/S1).

**States:** not specified (see G-01).

---

### 1.6 Task (Завдання)

**Attributes**
- `title` (назва): required (US-16/CL), with a minimum length; one character is rejected (US-16/S3).
- `description` (опис): required (US-16/CL, US-16/S2, US-12/CL).
- `price` (ціна): required, numeric (US-17/S3), set only by the customer (US-13, US-17, US-42). It must be within "встановлених платформою лімітів" ("limits set by the platform") (US-17/CL). The minimum is 50 UAH *(example value)* (US-17/S2). A price of 0 or less is invalid (US-15/S2). The currency is UAH ("грн"; US-13/S1, US-15/S1, US-17/S1).
- `deadline` (строк виконання): required (US-12/CL, US-12/S2, US-16/CL), given as "дата та час" ("date and time") (US-22/S3).
- `net amount to student`: derived as price minus commission. Example: 1000 UAH at 10% gives 900 UAH (US-15/S1).
- `owner customer`: US-25/S1, US-31/S2.
- `executor`: at most one ("одне мікрозавдання", "one micro-task"; US-25/S2).
- `status`: see the table below.
- `moderation rejection reason`: "з причиною заборони домашніх завдань" ("with the reason that homework is forbidden") (US-40/S2).
- `result files`: see 1.9. `chat`: see 1.11.
- `обсяг` ("volume / scope") is named in the US-37 title as part of the experience record, but the task has no such attribute (see C-05).

**Status labels as written in the requirements**

| Label (verbatim) | Meaning | Source |
|---|---|---|
| «На перевірці» | Awaiting **moderation** | US-14/CL, US-40/S3 |
| «Опубліковано» | Published, visible in the feed | US-14/CL, US-40/S1 |
| «Відхилено» | Rejected by moderation | US-14/CL |
| "блокується" (no label) | Blocked: invalid price, missing fields, or homework | US-12/S2, US-15/S2, US-40/S2 |
| "активне завдання" (no label) | Executor assigned, work in progress | US-22/CL, US-23/CL, US-27/CL |
| «На перевірці» | Result submitted, awaiting the **customer's** decision | US-28/CL, US-28/S1, US-29 |
| «На доопрацюванні» | Returned for revision | US-32/S1 |
| «Виконано» | Done, deal closed | US-31/S1 |
| "скасоване замовником" (no label) | Cancelled by the customer before completion | US-37/S2 |

Note that «На перевірці» labels two different states (see C-02).

**Transitions**

| # | From | To | Initiator | Condition | Source |
|---|---|---|---|---|---|
| K1 | (none) | «На перевірці» (moderation) | Customer («Опублікувати на перевірку», "Submit for review") | Title, description, price and deadline present and valid. The status is set to «На перевірці» "автоматично" ("automatically") even if the request tries to publish directly. | US-16/S1, S2, S3, US-17, US-40/S3 |
| K2 | «На перевірці» (moderation) | «Опубліковано» | Moderator («Опублікувати», "Publish") | "реальне комерційне замовлення" ("a real commercial order") | US-40/S1, US-14/S1 |
| K3 | «На перевірці» (moderation) | «Відхилено» / blocked | Moderator («Відхилити») | The task is homework. A reason is given. The task "ніколи не потрапляє до стрічки" ("never reaches the feed"). | US-40/S2, US-14/S3 |
| K4 | «На перевірці» (moderation) | blocked | Moderator or system | Price is 0 or less. "завдання блокується на етапі модерації" ("the task is blocked at the moderation stage") | US-15/S2 |
| K5 | «Опубліковано» | Active (executor assigned) | Customer («Обрати виконавцем», "Choose as executor") | The chosen student applied. No executor yet. The full price is reserved (1.8). If the reservation fails, the assignment is cancelled. | US-25/S1, S2, S3, US-26/CL, US-26/S2 |
| K6 | Active | «На перевірці» (result) | Executor («Надіслати на перевірку») | At least one result file is uploaded | US-28/CL, US-28/S1, S2 |
| K7 | «На перевірці» (result) | «Виконано» | Owner customer («Прийняти результат», "Accept result") | Confirmation. In one transaction: escrow is released, the student's balance is credited, the experience record is created and the notification is sent. | US-31/S1, US-30/S1, US-34/S1, US-37/S1 |
| K8 | «На перевірці» (result) | «На доопрацюванні» | Owner customer («На доопрацювання», "Return for revision") | A non-empty comment within the length limit | US-32/CL, US-32/S1, US-33 |
| K9 | «На доопрацюванні» | «На перевірці» (result) | Executor | An updated version is uploaded and resubmitted. This is implied by "студент отримує можливість завантажити оновлену версію" ("the student can upload an updated version"). | US-32/S1 |
| K10 | Not stated | Cancelled | Customer | "до його завершення" ("before its completion") | US-37/S2 only |

**Explicitly forbidden transitions and actions**
- «Виконано» to any working status: "закриту угоду не можна повернути в робочий статус" ("a closed deal cannot be returned to a working status") (US-32/S2).
- Accepting a task already in «Виконано» (US-31/S3).
- Resubmitting while in «На перевірці» (US-28/S3).
- Deleting the task after an executor is assigned (US-22/S2).
- Assigning a second executor (US-25/S2).
- Publishing without moderation (US-40/S3).
- Accept, return or select actions by anyone other than the owner customer (US-31/S2).

---

### 1.7 Application / Response (Відгук)

**Attributes**
- `student`: must be verified (US-18/S3). `task`: must be published ("перевіреного завдання", "a reviewed task"; US-18/S1).
- `note` (записка): optional (US-19/S3), with a maximum length (US-19/S2; value not given).
- `status`: «Надіслано» ("Sent"), «Прийнято» ("Accepted") or «Відхилено» ("Rejected") (US-20).
- **No price attribute.** "у формі відсутні будь-які поля для зміни бюджету" ("the form has no fields for changing the budget") (US-42/S1). A submitted price is ignored or rejected (US-13/S2, US-42/S2).

| # | From | To | Initiator | Condition | Source |
|---|---|---|---|---|---|
| R1 | (none) | «Надіслано» | Verified student («Відгукнутися», "Apply", then «Підтвердити», "Confirm") | Task published. No earlier application by the same student to the same task. | US-18/S1, S2, S3, US-19/S1 |
| R2 | «Надіслано» | «Прийнято» | Customer (select executor, K5) | See K5 | US-20/S2, US-25/S1 |
| R3 | «Надіслано» | «Відхилено» | System | Another candidate was selected: "решта відгуків отримують статус відхилених" ("the remaining applications get the rejected status") | US-25/S1, US-20/S3 |
| R4 | «Надіслано» | «Відхилено» | Customer | "відхилив цей відгук" ("rejected this application"). Mentioned only in a scenario precondition; there is no checklist item or UI element for it. | US-20/S3 |
| R5 | «Прийнято» (attempted) | «Надіслано» | System | The selection transaction failed. "стан відгуку повертається до безпечного попереднього стану" ("the application state returns to the safe previous state") | US-21/S2 |

Not specified: withdrawal by the student, what happens to applications when a task is cancelled, and applications after the deadline.

---

### 1.8 Escrow Reservation (Резервування коштів)

**Attributes:** `amount`, which is the full task price ("повної суми завдання", "the full task amount"; US-26/CL; 500 UAH example in US-26/S1). `source`: the customer's "баланс/картка" ("balance/card") (US-26/S1). `task` (one reservation per task, US-26/S3). `state`.

| # | From | To | Initiator | Condition | Source |
|---|---|---|---|---|---|
| E1 | (none) | Reserved ("блокується системою як зарезервована", "locked by the system as reserved") | Customer | "Перед або під час призначення виконавця" ("before or during executor assignment"). Funds must be sufficient. | US-26/CL, US-26/S1 |
| E2 | (none) | Failed | Gateway | «Недостатньо коштів» ("Insufficient funds"). The executor assignment is cancelled. | US-26/S2 |
| E3 | Reserved | Reserved (no-op) | Customer, repeated request | "ігнорує дублюючий запит і не списує кошти вдруге" ("ignores the duplicate request and does not charge twice") | US-26/S3 |
| E4 | Reserved | Released to the student (net of commission) | System, on K7 | Customer accepted the result | US-31/CL, US-31/S1, US-34/S1 |
| E5 | Reserved | Reserved (held) | System | The release failed: "кошти залишаються на ескроу-рахунку до вирішення ситуації" ("funds stay in the escrow account until the situation is resolved") | US-34/S2 |

Not specified: refund to the customer after cancellation or a dispute, who resolves E5 "до вирішення ситуації", and whether there is a time limit.

---

### 1.9 Result Submission (Результат)

**Attributes**
- `file(s)`: uploaded to the task card (US-27/CL, US-27/S1). Forbidden types include `.bat` and `.scr` ("помилка безпеки формату файлу", "file-format security error"; US-27/S2). Maximum size 50 MB *(example value)* (US-27/S3). The text says "файл" (singular) in US-27 but "файлів" (plural) in US-29/S3.
- `version`: an "оновлену версію" ("updated version") exists after revision (US-32/S1).
- `editable`: yes before submission. Locked in «На перевірці»: "блокує редагування файлів до прийняття рішення замовником" ("blocks file editing until the customer decides") (US-29/S3).

| # | From | To | Initiator | Condition | Source |
|---|---|---|---|---|---|
| F1 | (none) | Uploaded (draft, editable) | Executor («Зберегти результат», "Save result") | Task is active. Allowed type and size. | US-27/S1, S2, S3 |
| F2 | Uploaded | Submitted (locked) | Executor | Together with K6 | US-28/S1, US-29/S3 |
| F3 | Submitted | Accepted (final) | Customer | Together with K7 | US-31/S1 |
| F4 | Submitted | Returned (a new version may be uploaded) | Customer | Together with K8 | US-32/S1 |

---

### 1.10 Revision Request

**Attributes:** `comment`: required ("Поле коментаря є обов'язковим", "The comment field is mandatory"; US-33/CL). An empty comment gives «Коментар до доопрацювання є обов'язковим» ("A revision comment is required") (US-33/S2). There is a maximum length (US-33/S3; value not given). Linked to the task and delivered to the student: "завдання повертається студенту разом із цим коментарем" ("the task is returned to the student together with this comment") (US-33/S1).

**States:** none. It is an immutable event attached to K8.

---

### 1.11 Chat and Message

**Attributes:** `participants`: the customer and the selected student only ("між замовником та обраним студентом", "between the customer and the selected student"; US-23/CL). `message text`: non-empty (US-23/S2). `scope`: within the active task card (US-23/CL, J-5).

| # | From | To | Initiator | Condition | Source |
|---|---|---|---|---|---|
| C1 | No chat | Chat available | System | "студент і замовник зв'язані активним завданням" ("the student and the customer are linked by an active task"), i.e. after K5 | US-23/S1, J-5 |
| C2 | (none) | Message delivered | A participant («Надіслати», "Send") | Non-empty text. Appears "миттєво" ("instantly") for the other party. | US-23/S1, S2 |
| C3 | (none) | Access denied (403) | Non-participant | Opens the chat via a direct link | US-23/S3 |

Not specified: whether the chat is available after «Виконано» or cancellation, attachments, message length limit, editing or deletion, and moderator access.

---

### 1.12 Notification

**Attributes:** `recipient`. `text`, for example «Вас обрано виконавцем завдання [Назва]» ("You have been chosen as executor of task [Title]"; US-21/S1) and «Ваш результат прийнято замовником! Оплату нараховано» ("Your result was accepted by the customer! Payment credited"; US-30/S1). `read status`: "непрочитане" ("unread") (US-21/S3, US-30/S3). `channel`: "системне сповіщення на платформі" ("system notification on the platform") (US-21/S1), "центр сповіщень" / "панель сповіщень" ("notification centre/panel") (US-21/S3, US-30/S3).

**Triggers stated in the requirements**

| Trigger | Recipient | Source |
|---|---|---|
| Selected as executor (R2) | Student | US-21/CL, US-21/S1 |
| Result accepted (K7) | Student | US-30/CL, US-30/S1 |
| Verification rejected (V3) | User | US-39/S2 |
| Registration and resend (A1, A4) | User, by email | US-06/S1, US-07 |

| # | From | To | Initiator | Condition | Source |
|---|---|---|---|---|---|
| N1 | (none) | Unread | System | Only if the triggering business transaction commits | US-21/S2, US-30/S2 |
| N2 | Unread | Read | Recipient | Opens it. Implied by the "непрочитане" wording. | US-21/S3, US-30/S3 |

---

### 1.13 Balance and Financial Transactions

**Attributes:** the student's internal balance, "внутрішній баланс студента, доступний до виведення" ("the student's internal balance, available for withdrawal") (US-34/S1). The customer's balance is implied in US-26/S1. Per completed task the breakdown is `gross` (price), `commission` and `net` (US-35/CL; 1000 / 100 / 900 in US-35/S1). Precision is two decimals, rounded "за стандартними правилами без розбіжностей у балансі" ("by standard rules without balance discrepancies") (US-35/S2). A "історія фінансів" ("financial history") view exists (US-35/S3).

| # | Event | Effect | Initiator | Condition | Source |
|---|---|---|---|---|---|
| B1 | Credit | Student balance increases by the net amount | System, on K7 | At most once per task: "захист транзакцій запобігає повторному зарахуванню" ("transaction protection prevents a second credit") | US-34/S1, S3 |
| B2 | Credit failed | No change. The error is logged. Funds stay in escrow. | System | Gateway failure | US-34/S2 |
| B3 | Debit | The balance decreases by the withdrawal amount | Student, through 1.14 | Amount is no more than the balance | US-36/S3 |

---

### 1.14 Withdrawal Request (Заявка на виведення)

**Attributes:** `amount`. `card number` for a Ukrainian bank card, validated for "формат української банківської картки" ("Ukrainian bank card format"), digit count and a non-foreign issuer (US-36/S2). Card details may be saved: "зберегти реквізити" ("save details") (US-36/S2), "форма для введення банківських реквізитів" ("a form for entering bank details") (US-36/CL).

| # | From | To | Initiator | Condition | Source |
|---|---|---|---|---|---|
| W1 | (none) | Created ("створюється заявка", "a request is created") | Student («Вивести кошти», "Withdraw funds") | Sufficient balance, valid Ukrainian card | US-36/S1 |
| W2 | (none) | Refused | System | «Недостатньо коштів на балансі для виведення» ("Insufficient balance for withdrawal") | US-36/S3 |

The requirements stop at "Created". Processing, completion, failure and who executes the payout are not specified (see G-11).

---

### 1.15 Experience Record (Запис про досвід / резюме)

**Attributes:** `title` (from the task), `description` in US-37/CL or "обсяг" ("volume / scope") in the US-37 title, `completion date` ("точною датою виконання", "the exact completion date"; US-37/S1). The marker is «Підтверджено платформою CtoC» ("Confirmed by the CtoC platform") (US-38/CL). Records are ordered newest first (US-37/S3).

| # | From | To | Initiator | Condition | Source |
|---|---|---|---|---|---|
| X1 | (none) | Confirmed (immutable) | System, on K7 | The task is completed and accepted. Never created for a cancelled task. | US-37/CL, US-37/S1, S2 |

There are no further transitions. The student cannot create or edit records (US-05/CL, US-38/CL, US-38/S2), and the marker survives profile edits (US-38/S3).

---

### 1.16 Platform Configuration and Reference Data

| Item | Stated attributes | Changed by | Source |
|---|---|---|---|
| Commission | "Процентна ставка або фіксована сума" ("a percentage rate or a fixed amount"), example 10% | Administrator "в бекофісі" ("in the back office") | US-03/CL, US-03/S3, US-15/S1 |
| Task price limits | Minimum 50 UAH *(example value)*. A maximum is implied by "лімітів" ("limits", plural). | Platform (actor not stated) | US-17/CL, US-17/S2 |
| University domain directory | "довідник" ("directory") of academic domains | Not stated | US-06/CL |
| Skill catalogue | "зі списку" ("from a list") | Not stated | US-10/CL |
| Limits | Token 24 h; document 10 MB; skills 20; bio 500; result 50 MB (all *example values*). Note, comment and message limits exist but have no values. | Not stated | US-07, US-08, US-10, US-11, US-27, US-19, US-33 |
| Landing content | "Як це працює" ("How it works") with 3–4 steps, each with an icon and a description. "Оплата та безпека" ("Payment and security") section. Résumé explanation with a "візуальний приклад" ("visual example"). | Not stated | US-02, US-04, US-05 |

### 1.17 Moderation Decision (implicit)

Both moderation queues (US-39/CL, US-40/CL) produce a decision with a `moderator`, an `outcome` (approve or publish, or reject) and a `reason`, which is required on rejection (US-39/S2, US-40/S2). There is no story for a decision log, but US-41/S3 ("аудит безпеки", "security audit") implies that decisions can be audited.

---

## 2. Business rules and invariants

### 2.1 Registration and identity

| ID | Rule | Source |
|---|---|---|
| BR-01 | Registration is allowed only with an email on an academic domain: «Дозволено реєстрацію лише з використанням університетської електронної пошти» ("Registration is allowed only with a university email") | US-06/CL, US-06/S2 |
| BR-02 | Email is unique across accounts: «Ця електронна пошта вже використовується» ("This email is already in use") | US-06/S3 |
| BR-03 | A new account is created "неактивний" ("inactive") with status «Непідтверджений» ("Unconfirmed") | US-06/CL, US-06/S1 |
| BR-04 | The email is confirmed only by a unique link with limited validity (24 h *(example value)*). An expired link gives an error and an offer to resend. A resend generates a new token. | US-07/CL, US-07/S2, US-07/S3 |
| BR-05 | A university email alone does **not** grant the Student role. "Роль «Студент» присвоюється системно лише після схвалення документа адміністратором" ("The «Студент» role is assigned by the system only after an administrator approves the document") | US-08/CL, US-39/S1; README risk 3 |
| BR-06 | Only a user with a confirmed email may submit a status document | US-08/S1 |
| BR-07 | The document must be JPG/PNG/PDF and at most 10 MB *(example value)*. Other formats are rejected. | US-08/S1, S2, S3 |
| BR-08 | Teachers, staff, agencies and seniors must not obtain the Student role. Moderators reject forged documents. | US-08/S1, US-39/S1, S2, US-41/S2 |
| BR-09 | A rejection requires a reason and notifies the user | US-39/S2 |

### 2.2 Profile

| ID | Rule | Source |
|---|---|---|
| BR-10 | The «верифікований студент» ("verified student") badge is shown if and only if the user holds the approved Student role. It appears "автоматично" ("automatically") and persists across reloads and logins. | US-09/CL, US-09/S1, S2, S3, US-24/S2 |
| BR-11 | Skills cannot be empty. There is a maximum count (20 *(example value)*); a 21st is blocked "з повідомленням про досягнення ліміту" ("with a message that the limit is reached"). | US-10/S2, S3 |
| BR-12 | The bio has a maximum length (500 *(example value)*). Longer text gives a validation error. Emoji and punctuation are stored losslessly (UTF-8). | US-11/CL, US-11/S1, S2, S3 |
| BR-13 | The profile (skills, bio, badge, experience) is visible to customers, and per US-38/S1 to "будь-який користувач" ("any user") | US-09/CL, US-10/S1, US-24/S1, US-38/S1 |

### 2.3 Tasks, pricing, moderation, feed

| ID | Rule | Source |
|---|---|---|
| BR-14 | A task requires title, description, price and deadline. The title has a minimum length greater than 1. | US-16/CL, US-16/S2, S3 |
| BR-15 | The price is set **only** by the customer, is numeric, is at least the platform minimum (50 UAH *(example value)*), is within platform limits, and is greater than 0 | US-17/CL, US-17/S2, S3, US-15/S2 |
| BR-16 | Every new task enters moderation. A publish request that bypasses the queue still ends in «На перевірці»: "завдання автоматично отримує обов'язковий статус «На перевірці»" ("the task automatically gets the mandatory status «На перевірці»") | US-16/S1, US-40/S3 |
| BR-17 | Only a moderator can move a task to «Опубліковано» ("Published"). Homework is rejected with a reason. | US-40/S1, S2 |
| BR-18 | The feed shows **only** «Опубліковано» tasks. «На перевірці» and «Відхилено» tasks never appear. A rejected task "ніколи не потрапляє до стрічки студентів" ("never reaches the students' feed"). | US-14/CL, US-14/S1, S2, S3 |
| BR-19 | A task missing any mandatory field (for example the deadline) is skipped by the feed or blocked until complete | US-12/S2 |
| BR-20 | Every feed card shows description, fixed price and deadline | US-12/CL, US-12/S1 |
| BR-21 | Every task card shows the gross price **and** the net amount to the student: net = price − commission (1000 → 900 at 10%) | US-15/CL, US-15/S1 |
| BR-22 | No price-proposal, bid or auction element exists anywhere in the UI. The backend rejects or ignores any price sent by a student. | US-13/CL, US-13/S2, S3, US-42/CL, US-42/S1, S2, S3; OOS |
| BR-23 | The feed is not available to unauthenticated users (redirect to login or registration). Per US-12/CL it is "для верифікованих студентів" ("for verified students"). | US-12/CL, US-12/S3 |
| BR-24 | A task cannot be deleted after an executor is assigned ("щоб студент не втратив умови виконання", "so the student does not lose the terms of the work") | US-22/S2 |

### 2.4 Applications and executor selection

| ID | Rule | Source |
|---|---|---|
| BR-25 | Only a verified student may apply. Others are blocked and invited to complete verification. | US-18/S3 |
| BR-26 | At most one application per (student, task): «Ви вже подали відгук на це завдання» ("You have already applied to this task") | US-18/S2 |
| BR-27 | Applications are possible only to tasks that passed moderation ("перевіреного завдання", "a reviewed task") | US-18/S1 |
| BR-28 | The note is optional and length-limited. An over-long note blocks sending. | US-19/S2, S3 |
| BR-29 | An application carries the customer's fixed price. It never has its own price. | US-42/S1, S2 |
| BR-30 | The customer may select an executor **only among applicants** | US-25 title, US-25/CL |
| BR-31 | Exactly one executor per task. Once one is chosen, selection is disabled for the others. | US-25/S2 |
| BR-32 | Selecting an executor sets the chosen application to «Прийнято» ("Accepted") and **all other** applications to «Відхилено» ("Rejected") | US-25/S1, US-20/S2, S3 |
| BR-33 | Selection requires a prior or simultaneous reservation of the full price. Without it, "система вимагає попереднього резервування коштів" ("the system requires funds to be reserved first"). | US-25/S3, US-26/CL |
| BR-34 | Selection, application status change and notification are atomic. On failure no notification is sent and the application returns to its previous state. | US-21/S2 |
| BR-35 | The selected student gets the in-platform notification «Вас обрано виконавцем завдання [Назва]», kept as unread until opened | US-21/S1, S3 |

### 2.5 Escrow and payments

| ID | Rule | Source |
|---|---|---|
| BR-36 | Escrow amount = **full** task price, locked before or at assignment | US-26/CL, US-26/S1 |
| BR-37 | Insufficient funds gives «Недостатньо коштів» ("Insufficient funds") and **cancels** the assignment | US-26/S2 |
| BR-38 | A duplicate reservation request is ignored. No double charge. | US-26/S3 |
| BR-39 | On acceptance the reserved funds are released, and the student's balance is credited with price − commission, immediately available for withdrawal | US-31/CL, US-31/S1, US-34/CL, US-34/S1 |
| BR-40 | The credit happens at most once per task, including when duplicate webhooks arrive | US-34/S3 |
| BR-41 | If the credit fails, the error is logged and the funds stay in escrow "до вирішення ситуації" ("until the situation is resolved") | US-34/S2 |
| BR-42 | Breakdown values are rounded to 2 decimals "без розбіжностей у балансі" ("without balance discrepancies"), i.e. gross = commission + net, exactly | US-35/S2 |
| BR-43 | A withdrawal requires a valid Ukrainian bank card (format, digit count, Ukrainian issuer) and an amount no greater than the balance | US-36/S2, S3 |
| BR-44 | The commission is public before registration, stated in numbers "без прихованих умов" ("without hidden conditions"), and when the admin changes it the current value is shown "без застарілого кешу" ("without stale cache") | US-03/CL, US-03/S1, S2, S3 |
| BR-45 | The public payment description must mention reservation of funds by the customer. Its absence is a defect. | US-04/CL, US-04/S2 |

### 2.6 Work, submission and acceptance

| ID | Rule | Source |
|---|---|---|
| BR-46 | Only the assigned executor sees the active task card (terms, deadline, agreed price) and can upload results | US-22/CL, US-22/S1, US-27/CL |
| BR-47 | Result files: executable types such as `.bat` and `.scr` are blocked as a security error. Size is at most 50 MB *(example value)*. | US-27/S2, S3 |
| BR-48 | Submission requires at least one uploaded file | US-28/S2 |
| BR-49 | A task already in «На перевірці» cannot be resubmitted | US-28/S3 |
| BR-50 | While in «На перевірці», result files cannot be deleted or changed | US-29/S3 |
| BR-51 | Only the owner customer may accept. Anyone else gets 403. | US-31/S2 |
| BR-52 | Accepting sets «Виконано» ("Done"), closes the deal and releases funds. Repeated acceptance is impossible. | US-31/CL, US-31/S1, S3 |
| BR-53 | Return for revision is allowed **only** from «На перевірці» and is impossible from «Виконано» | US-32/CL, US-32/S2 |
| BR-54 | A revision comment is mandatory and length-limited | US-32/S3, US-33/CL, US-33/S2, S3 |
| BR-55 | After a return, the student may upload an updated version | US-32/S1 |
| BR-56 | The acceptance notification is sent only if the acceptance transaction commits. On a database error the status stays unchanged and nothing is sent. | US-30/S1, S2 |
| BR-57 | Chat is only between the customer and the selected student of an active task. Third parties get 403. Empty messages are not sent. | US-23/CL, US-23/S2, S3 |
| BR-58 | Deadlines are displayed in the user's local time zone | US-22/S3 |

### 2.7 Experience records

| ID | Rule | Source |
|---|---|---|
| BR-59 | An experience record is created **automatically** and only when a task is completed and accepted. None is created for a cancelled task. | US-37/CL, US-37/S1, S2 |
| BR-60 | Each record carries «Підтверджено платформою CtoC» ("Confirmed by the CtoC platform"). There is no manual add or edit by the student. Profile edits do not affect the marker. | US-38/CL, US-38/S1, S2, S3, US-05/CL |
| BR-61 | Records are sorted newest first | US-37/S3 |
| BR-62 | Public copy must not claim that users add projects themselves. Such text "блокується" ("is blocked"). | US-05/S2 |

### 2.8 Access and product boundaries

| ID | Rule | Source |
|---|---|---|
| BR-63 | The moderator panel is forbidden to ordinary students (403) | US-39/S3 |
| BR-64 | Only student-role holders compete for tasks. Commercial contractors are excluded by registration rules and manual moderation. | US-41/CL, US-41/S1, S3 |
| BR-65 | Students must not publish tasks ("студентам заборонено публікувати завдання", "students are forbidden to publish tasks"). This is stated **only in the README** and is implied by the purpose of US-40. | README risk 4 |
| BR-66 | Communication happens only in the internal chat. There are no third-party messengers. | US-23, OOS |
| BR-67 | The interface is Ukrainian only | OOS |
| BR-68 | "How it works" has exactly 3 or 4 steps, each with an icon and text. With fewer or more steps a default 3–4 step structure is shown. A step without text gets template text or is hidden. | US-02/CL, US-02/S2, S3 |
| BR-69 | The beginners-only message is above the fold on desktop and on mobile | US-01/S2, S3 |

---

## 3. Non-functional requirements (stated or implied)

### 3.1 Access without authentication
- **NFR-01 Public pages.** Landing positioning (US-01), "Як це працює" ("How it works", US-02), commission (US-03), "Оплата та безпека" ("Payment and security", US-04) and the résumé explanation with an example (US-05) must be reachable without an account.
- **NFR-02 Email confirmation link.** It must work without an active session. The user opens it "у поштовій скриньці" ("from the mailbox") (US-07/S1), possibly on another device.
- **NFR-03 Resend email.** It must be reachable by an unconfirmed user "на сторінці профілю/авторизації" ("on the profile/login page") (US-07/S3). This means an unconfirmed account can reach at least a limited authenticated or semi-authenticated surface.
- **NFR-04 Everything else requires authentication.** Feed, task card, applications, chat, finance and back office. Unauthenticated access to the feed redirects to login (US-12/S3).
- **NFR-05 Public profile and experience.** Whether these must be reachable without authentication is open (US-38/S1 "будь-який користувач", "any user"; the employer-trust motive). See G-14.

### 3.2 Authorization and security
- **NFR-06 Server-side authorization.** Every rule must be enforced by the server, not just hidden in the UI. The requirements explicitly consider "інструменти розробника" ("developer tools") and "зловмисний API-запит" ("a malicious API request") (US-13/S2, US-42/S2), "уразливість API" ("an API vulnerability") (US-40/S3), and "через API" ("via the API") (US-31/S2).
- **NFR-07 Object-level access control (direct links / IDOR).** Chat (US-23/S3), result acceptance (US-31/S2) and the moderator panel (US-39/S3) must return **403** to non-owners or non-participants. By the same reasoning this extends to result files, applications and verification documents.
- **NFR-08 Role-based access.** Visitor, unconfirmed user, confirmed non-student, verified student, customer and moderator/admin each have a distinct permission set (US-12/S3, US-18/S3, US-39/S3).
- **NFR-09 Upload security.** Validate type and size on the server (US-08/S2, S3, US-27/S2, S3). US-27/S2 frames it as a "помилка безпеки" ("security error"). This implies type detection that cannot be bypassed by renaming, and that uploaded content is never executed or served as active content.
- **NFR-10 Sensitive personal data.** Student ID scans (US-08) are identity documents. Their access must be limited to the owner and moderators.
- **NFR-11 Card data.** Card numbers and saved "реквізити" ("bank details") (US-36) are payment data and fall under payment-card data-protection obligations. Minimising what is stored is itself a requirement. See G-11.
- **NFR-12 Credentials and tokens.** Passwords (US-06/S1) must be stored non-reversibly. Confirmation tokens must be unique, unguessable and expiring (US-07/CL).
- **NFR-13 Abuse controls.** Resend email (US-07/S3), registration (US-06) and login need rate limiting. US-06/S3 deliberately discloses whether an email is registered, so account enumeration is an accepted product risk that rate limits should reduce.
- **NFR-14 Payment callbacks.** Webhooks from the payment side (US-34/S3) must be authenticated, and the server must reject spoofed callbacks.
- **NFR-15 Auditability.** Moderation decisions with reasons (US-39/S2, US-40/S2), financial errors ("система логує помилку", "the system logs the error"; US-34/S2), and a verifiable origin for «Підтверджено платформою CtoC» records (US-38) must all be traceable. US-41/S3 expects a security audit to pass.

### 3.3 Data integrity, transactions, concurrency
- **NFR-16 Atomic business transitions.** Selection plus escrow plus application statuses plus notification (US-21/S2, US-26/S2). Acceptance plus status plus escrow release plus balance credit plus experience record plus notification (US-30/S2, US-31/S1, US-34/S1, US-37/S1). Each is all-or-nothing, with rollback to the "безпечного попереднього стану" ("safe previous state").
- **NFR-17 Idempotency.** Reservation (US-26/S3), balance credit including duplicate webhooks (US-34/S3), acceptance (US-31/S3), submission (US-28/S3) and application creation (US-18/S2) must be idempotent or rejected on repeat.
- **NFR-18 Concurrency safety.** These races must not break invariants:
  - two simultaneous «Обрати виконавцем» clicks or tabs must not give two executors (BR-31);
  - parallel applications by the same student must not give duplicates (BR-26);
  - simultaneous accept and return for revision on the same task (BR-52/BR-53);
  - parallel withdrawal requests must not exceed the balance (BR-43);
  - two moderators deciding the same task or document;
  - an executor replacing a file while the customer accepts (BR-50).
- **NFR-19 Money arithmetic.** Use exact decimal amounts in kopecks with 2-decimal rounding, so that gross = commission + net (US-35/S2). No accumulated balance drift.
- **NFR-20 Commission consistency.** The net amount shown on the card (US-15) must equal the amount later credited (US-34, US-35). Changing the rate (US-03/S3) must not silently change it for tasks already in flight (see G-06).
- **NFR-21 Immutability.** Task terms after assignment (US-22/S2), submitted result files during review (US-29/S3), closed deals (US-31/S3, US-32/S2) and experience records (US-38) are immutable.

### 3.4 Responsiveness and freshness
- **NFR-22 Near-real-time chat.** Messages appear "миттєво" ("instantly") for the counterpart (US-23/S1).
- **NFR-23 Prompt notifications.** The student "одразу" ("immediately") gets the selection notification (US-21/S1), and notifications persist for later reading as unread (US-21/S3, US-30/S3).
- **NFR-24 No stale data.** Commission is shown "без застарілого кешу" ("without stale cache") (US-03/S3). Statuses must be correct after a refresh or re-open (US-20/S2, US-29/S2, US-09/S3).

### 3.5 Usability, platform and localisation
- **NFR-25 Responsive layout.** Mobile use is required: no horizontal scroll and no overlapping fonts (US-04/S3), key landing content above the fold (US-01/S2, S3), readable price blocks (US-15/S3), no layout shift in profiles (US-24/S3), and all three breakdown values visible (US-35/S3).
- **NFR-26 Ukrainian only.** UI language is Ukrainian (OOS). Text storage is UTF-8 including emoji (US-11/S3).
- **NFR-27 Currency and time.** Currency is UAH with 2-decimal precision (US-13, US-35/S2). Date-times must be time-zone aware, shown in the user's local zone (US-22/S3).
- **NFR-28 Graceful content fallback.** The landing must degrade to defaults when content is malformed (US-02/S2, S3).

### 3.6 Operational
- **NFR-29 Back-office tooling.** Two manual moderation queues (US-39/CL, US-40/CL) plus commission administration (US-03/S3). The system's throughput is bounded by moderator capacity, but no SLA is given (see G-17).
- **NFR-30 Unspecified qualities.** Performance, availability and data retention are not stated anywhere. They are listed here so the design states its own targets explicitly.

---

## 4. Gaps and open questions

### 4.1 Contradictions and inconsistencies in the source

| ID | Conflict | Sources | Why it matters | Cheapest resolution for the MVP |
|---|---|---|---|---|
| C-01 | "не верифікований користувач подав відгук" ("a non-verified user submitted an application") contradicts "система блокує дію" ("the system blocks the action") for non-verified applicants | US-24/S2 vs US-18/S3 | It determines whether applications from non-verified users can exist at all | Follow US-18/S3. Treat US-24/S2 as unreachable, or reinterpret it as "a student whose role was revoked after applying". |
| C-02 | «На перевірці» labels both "awaiting moderation" and "awaiting the customer's review of the result" | US-14/CL, US-40/S3 vs US-28/CL, US-29 | A single task status field would hold two different states under one label. The UI and the rules (for example "feed hides «На перевірці»") become ambiguous. | Keep two distinct internal states. Choose distinct display labels, for example «На модерації» ("In moderation") for the first. |
| C-03 | The verification document status is «На перевірці адміністратором» in one place and «Очікує перевірки» in another | US-08/CL vs US-08/S1 | Status labels are user-facing strings | Pick one label. |
| C-04 | Escrow happens "before" selection, or "before or during" it, and a failed reservation "скасовує процес призначення" ("cancels the assignment process") | US-25/S3 vs US-26/CL, US-26/S1, S2 | It defines whether selection and reservation are one step or two | Treat them as one atomic step: «Обрати виконавцем» triggers the reservation, and the assignment commits only if the reservation succeeds. |
| C-05 | The experience record has "назвою, обсягом і датою" ("title, volume and date") in the title but "назвою, описом та датою" ("title, description and date") in the checklist | US-37 title vs US-37/CL, US-37/S1 | "обсяг" ("volume / scope") is not an attribute of any entity | Use the checklist: title, description, date. |
| C-06 | The credit to the internal balance is "автоматично" ("automatic"), yet it can fail at the "платіжного шлюзу" ("payment gateway") and be duplicated by "вебхук" ("webhook") | US-34/S1 vs US-34/S2, S3 | It is unclear whether the internal credit depends on an external money movement | See G-05. |
| C-07 | The feed is "для верифікованих студентів" ("for verified students"), but only the unauthenticated case is specified | US-12/CL vs US-12/S3 | It is unclear what customers, unconfirmed users and non-student users see | See G-09. |
| C-08 | The "How it works" steps are "реєстрація, відгук, виконання, оплата" ("registration, application, execution, payment") in one place but "від реєстрації до отримання завдання" ("from registration to receiving a task") in another | US-02/CL vs US-02/S1 | Content only. Low impact. | Use the checklist version. |
| C-09 | "на платформі зареєстровані лише верифіковані студенти" ("only verified students are registered on the platform") contradicts the existence of customers and unconfirmed accounts | US-41/S1 vs US-06, US-16 | Wording only | Read it as "only verified students can act as executors". |

### 4.2 Missing requirements that block design

Each gap lists **what is missing**, **why it blocks**, and the **cheapest MVP answer**.

**G-01 How customers register and authenticate**
- *Missing:* There is no story for customer sign-up. The only registration story (US-06) **requires** a university email, which a business owner does not have. US-16/S1 assumes an "авторизований замовник" ("authorised customer").
- *Why it blocks:* There is no customer identity, so no task ownership (US-25, US-31/S2), no escrow payer (US-26) and no role model.
- *Cheapest answer:* Use the same account mechanism. At sign-up the user picks "Customer", any email domain is allowed, and the email is confirmed by the same link flow (US-07). No business verification in the MVP.

**G-02 Separating roles, and stopping students from posting tasks**
- *Missing:* Whether one account can be both student and customer. The README rule "студентам заборонено публікувати завдання" ("students are forbidden to publish tasks") is absent from the stories.
- *Why it blocks:* It decides the permission model and whether the homework-prevention rule is enforced by role or only by moderation (US-40).
- *Cheapest answer:* One role per account. Student accounts cannot create tasks and customer accounts cannot apply. Rely on US-40 moderation for a student who opens a second, customer account.

**G-03 Authentication lifecycle**
- *Missing:* Login and logout, password rules, password reset, session lifetime, and whether an unconfirmed account can log in. US-07/S3 implies it can reach some page, and US-09/S3 mentions "повторний вхід" ("logging in again").
- *Why it blocks:* Access control (NFR-02…NFR-04) cannot be specified without it.
- *Cheapest answer:* Email plus password. Password reset reuses the US-07 token-by-email mechanism. Unconfirmed accounts may log in, but can only resend the confirmation.

**G-04 Internal roles**
- *Missing:* Whether "член команди платформи", "модератор" and "адміністратор" are one role or several, and how those accounts are created.
- *Why it blocks:* It decides who may change the commission (US-03/S3), approve documents (US-39) and publish tasks (US-40).
- *Cheapest answer:* One internal role ("moderator/admin") with all back-office powers. Accounts are provisioned manually with no self-registration.

**G-05 How money moves in and out**
- *Missing:* How a customer funds the reservation (card per task, or a pre-funded "баланс", "balance", which needs a top-up story that does not exist). Whether "резервування" ("reservation") is a real hold of funds or a ledger entry. How payouts reach a card. Ukrainian regulatory constraints on a platform holding third-party funds.
- *Why it blocks:* The escrow (1.8), balance (1.13) and withdrawal (1.14) state machines, and every atomicity and idempotency rule (NFR-16, NFR-17), depend on it.
- *Cheapest answer:* For the MVP, charge the customer's card for the task price at selection, delegating the hold to an external payment provider. Keep an internal ledger for escrow and the student balance. Process payouts manually (see G-11). If real money is not legally feasible in the semester, simulate payments in a sandbox.

**G-06 Commission model**
- *Missing:* The actual rate. Whether it is a percentage or a fixed amount (US-03/CL allows either). Who bears it: US-15 shows it deducted from the student's share, and nothing is said about a customer-side fee. Which rate applies when an admin changes it (US-03/S3) while tasks are in flight. The rounding direction (US-35/S2 "за стандартними правилами", "by standard rules").
- *Why it blocks:* The card net amount (US-15), credit (US-34) and breakdown (US-35) must agree (NFR-20).
- *Cheapest answer:* One global percentage, deducted from the student's share. **Snapshot the rate onto the task at publication**, so the amount shown is the amount paid. Commission is rounded half-up to the kopeck, and net = gross − commission.

**G-07 Cancellation, deletion, editing and deadline expiry for tasks**
- *Missing:* US-37/S2 refers to a task "скасоване замовником до його завершення" ("cancelled by the customer before its completion"), but there is no cancellation story. Also missing: deletion before assignment (only deletion *after* is forbidden, US-22/S2), editing during moderation or after publication or rejection, resubmission after a moderation rejection, and what happens when the deadline passes with no submission.
- *Why it blocks:* The task state machine (1.6) and escrow refunds (1.8) are incomplete without terminal and rollback paths.
- *Cheapest answer:*
  - No editing after submission to moderation. A rejected task is re-created as a new task.
  - The customer may cancel or delete only **before** an executor is selected, when no money is held.
  - After assignment, only a moderator/admin can cancel, with a full refund to the customer.
  - The deadline is informational only, with no automatic transitions.

**G-08 Disputes and stalled deals**
- *Missing:* Unlimited revision loops (K8/K9). A customer who never accepts or rejects. A student who never submits. Who resolves funds stuck "до вирішення ситуації" ("until the situation is resolved") (US-34/S2).
- *Why it blocks:* Escrow can be locked forever, and the student has no protection, which contradicts the US-04/US-26 promise of guaranteed payment.
- *Cheapest answer:* No automatic dispute flow. Add a moderator/admin manual resolution that either releases to the student (as K7) or refunds the customer (cancel). Unlimited revisions in the MVP.

**G-09 Feed visibility, ordering and discovery**
- *Missing:* Whether a task leaves the feed once an executor is chosen ("доступних", "available"; US-12/S1). Whether customers or non-student users can browse the feed. Ordering, pagination and filtering. Whether past-deadline tasks are hidden.
- *Why it blocks:* It defines the feed query rules and access rights.
- *Cheapest answer:* The feed lists only «Опубліковано» tasks with no executor and a future deadline. Only verified students can see it. Newest first, simple pagination, no filters.

**G-10 Remaining application lifecycle**
- *Missing:* Withdrawal by the student. Explicit rejection by the customer (US-20/S3 mentions it with no UI or checklist item). What happens to open applications when a task is cancelled. The note length limit. Any cap on a student's concurrent active tasks.
- *Why it blocks:* The application state machine (1.7) has undefined exits.
- *Cheapest answer:* No withdrawal. Provide an explicit customer "reject" action, since US-20/S3 expects «Відхилено». Cancelling a task rejects all its open applications. Note at most 500 characters. No cap.

**G-11 Withdrawal processing and card data**
- *Missing:* Everything after "створюється заявка" ("a request is created"): who executes the payout, the statuses, minimum amount, fees, whether the amount is reserved from the balance at request time, and whether and how card details are stored ("зберегти реквізити", "save details").
- *Why it blocks:* Balance correctness (NFR-18 parallel withdrawals) and payment-card data obligations (NFR-11).
- *Cheapest answer:* Statuses are Created → Paid or Rejected. Processed **manually** by an admin. The amount is deducted from the available balance when the request is created and returned if the request is rejected. No minimum and no fee. Store only a masked card number after processing, and do not persist full card numbers.

**G-12 Customer-side notifications and dashboards**
- *Missing:* The only notifications defined go to students (US-21, US-30, US-39/S2). The customer is never told that a new application arrived, that a result was submitted (yet US-29 says "замовник уже отримав мій результат", "the customer has already received my result"), or that their task was published or rejected by moderation. There is also no "my tasks" list for customers, and no notification for verification approval or for return for revision.
- *Why it blocks:* The customer cannot act on K5, K7 or K8 without discovering the state change. The notification event catalogue is needed for design.
- *Cheapest answer:* In-app notifications only, reusing the 1.12 mechanism, for these events: task published or rejected, new application, result submitted, result returned (to the student, with the comment), and verification approved. Add a customer "Мої завдання" ("My tasks") list with statuses. Email only for account-confirmation flows.

**G-13 Result delivery details**
- *Missing:* An allow-list or a block-list of file types (only `.bat` and `.scr` are named). One file or several. Whether a link or text result is allowed. Whether old versions are kept after revision. Who can download. Retention after completion.
- *Why it blocks:* Upload validation (NFR-09), access control (NFR-07) and the revision model (K9).
- *Cheapest answer:* Up to N files per submission. Block executable and script types. Keep all submitted versions read-only. Only the executor, the owner customer and moderators can download.

**G-14 Public profile and experience visibility**
- *Missing:* Whether the student profile and experience can be seen by people outside the platform (employers). US-38's motive is trust "в роботодавців" ("with employers"), and US-38/S1 says "будь-який користувач" ("any user"). Also missing: which fields are public (name? university? email?), and whether a customer's task description becomes public inside an experience record.
- *Why it blocks:* The authentication boundary (NFR-05) and personal-data and confidentiality exposure.
- *Cheapest answer:* A read-only public profile page reachable by URL, showing display name, badge, skills, bio and experience records (title, date, short description). Never show the email or the customer's identity. The customer accepts publication of the title and description in the terms of service.

**G-15 University domain directory and the skill catalogue**
- *Missing:* Where the list of university domains comes from, who maintains it, and whether a suffix rule such as `*.edu.ua` is enough. The same questions for the skill list in US-10.
- *Why it blocks:* BR-01 cannot be implemented without a data source.
- *Cheapest answer:* A static allow-list of Ukrainian higher-education domains, seeded once and editable by admin. A small seeded skill list plus free-text entry (US-10/CL allows custom skills).

**G-16 Verification lifecycle**
- *Missing:* Resubmission after rejection. Expiry or revocation of student status (graduates who are no longer beginners, US-41). How long documents are kept.
- *Why it blocks:* The verification state machine (1.3) has no exits after rejection. Data retention affects NFR-10.
- *Cheapest answer:* Unlimited resubmission. No automatic expiry. Manual revocation by admin. Delete the document file N days after the decision, keeping only the decision record.

**G-17 Moderation operations**
- *Missing:* Moderation SLA, how two moderators avoid deciding the same item, and whether an approved task can be unpublished later.
- *Why it blocks:* Concurrency (NFR-18) and the task state machine (an exit from «Опубліковано»).
- *Cheapest answer:* No SLA. First decision wins and later attempts are rejected. A moderator can unpublish (→ «Відхилено») only while there is no executor.

**G-18 Values given only as examples**
- *Missing:* Confirmed values for token TTL (24 h), document size (10 MB), maximum skills (20), bio (500), minimum price (50 UAH), result size (50 MB) and commission (10%). Values are missing entirely for the maximum price, note length, revision comment length and chat message length.
- *Why it blocks:* Validation rules cannot be specified with placeholders.
- *Cheapest answer:* Adopt the example values as-is and set the missing ones in configuration (A-11).

**G-19 Deadline semantics**
- *Missing:* Whether a deadline must be in the future at creation, the minimum lead time, whether it is date-only or date and time (US-22/S3 implies date and time), and the reference time zone.
- *Why it blocks:* Task validation and display (NFR-27).
- *Cheapest answer:* Date and time stored zone-aware. It must be in the future at submission. Display in the browser's local zone.

**G-20 Chat scope**
- *Missing:* Chat with applicants before selection (journey J-5 places chat after selection). Chat after «Виконано» or cancellation. Attachments. Moderator access for disputes.
- *Why it blocks:* The chat access rule (BR-57) and its retention.
- *Cheapest answer:* Text only. Available from K5 onwards, read-only after «Виконано» or cancellation. Moderators can read it during a dispute.

**G-21 Legal and consent**
- *Missing:* Terms of service and privacy consent at registration (personal data, ID scans, card data), minimum age (first-year students may be under 18), and tax or receipt obligations on payouts.
- *Why it blocks:* Registration (US-06) and withdrawal (US-36) may need mandatory consent steps and fields.
- *Cheapest answer:* A mandatory terms and privacy consent checkbox at registration. Out of scope: tax handling, with users responsible for it per the terms.

**G-22 Status of non-student university accounts**
- *Missing:* What a teacher or staff member (or a rejected applicant) with a confirmed email can do.
- *Why it blocks:* The permission set of the "confirmed, no role" state (1.1).
- *Cheapest answer:* They can edit the profile and resubmit verification, but cannot apply or create tasks.

---

## 5. Assumptions proposed for the MVP

Risk is the impact if the assumption turns out to be wrong.

| ID | Assumption | Resolves | Risk | Why that risk level |
|---|---|---|---|---|
| A-01 | Customers sign up with any email and confirm it like students (US-07). There is no business verification. | G-01 | **Medium** | If business verification is later required, a new verification flow and states are needed, but the account model survives. |
| A-02 | One role per account. Students cannot create tasks and customers cannot apply. | G-02, BR-65 | **Medium** | If dual-role accounts are wanted, permissions and dashboards need rework. |
| A-03 | One internal "moderator/admin" role, provisioned manually | G-04 | **Low** | Splitting it into finer roles later is additive. |
| A-04 | Email and password authentication. Password reset via the US-07 token mechanism. Unconfirmed accounts can log in only to resend confirmation. | G-03 | **Low** | Standard pattern, easy to extend. |
| A-05 | Selecting an executor and reserving funds is **one atomic action**. The assignment exists only if the reservation succeeds. | C-04, BR-33, BR-37 | **Low** | It satisfies US-25/S3, US-26/CL and US-26/S2 at the same time. |
| A-06 | Money moves through an external payment provider (or a sandbox simulation in the MVP). The platform keeps an internal ledger for escrow and student balances. | G-05 | **High** | If real funds must be held by the platform itself, or the regulatory route differs, the payment and escrow flows change substantially. This is the single largest design driver. |
| A-07 | Commission is one global percentage deducted from the student's share. The rate is snapshotted onto the task at publication. Rounding is half-up to the kopeck, and net = gross − commission. | G-06, NFR-20 | **Medium** | A customer-side fee or a fixed fee changes calculations and displays (US-03, US-15, US-35) but not the state machines. |
| A-08 | The customer may cancel or delete a task only before an executor is selected. After that, only an admin can cancel, with a full refund. No experience record for cancelled tasks. | G-07, US-37/S2 | **Medium** | If customer-initiated cancellation after assignment is needed (with partial pay), new states and refund rules are required. |
| A-09 | No automated dispute process. Admin manual resolution either releases to the student or refunds the customer. Unlimited revisions. | G-08 | **High** | Without it, escrow can lock indefinitely. If the users expect an SLA or auto-acceptance (for example after N days), the escrow lifecycle and scheduling change. |
| A-10 | Withdrawals are processed manually by an admin. The amount is held at request time. Full card numbers are not stored after processing. | G-11 | **Medium** | Automating payouts later is additive, but a wrong card-data policy carries compliance exposure. |
| A-11 | All "наприклад" ("for example") values are adopted as-is (24 h, 10 MB, 20 skills, 500 characters, 50 UAH, 50 MB, 10%). Missing limits get configurable defaults: note 500, revision comment 2000, chat message 2000, maximum price set in configuration. | G-18 | **Low** | Values are configuration, so changing them is cheap. |
| A-12 | Distinct internal states for "awaiting moderation" and "result under customer review", with distinct display labels | C-02 | **Low** | A labelling change only. Not doing it causes real ambiguity. |
| A-13 | The feed shows only «Опубліковано» tasks with no executor and a future deadline, visible only to verified students, newest first, with no filters | G-09, C-07 | **Low** | Filters and visibility to other roles can be added later. |
| A-14 | Applications cannot be withdrawn. The customer has an explicit reject action. Cancelling a task rejects all its open applications. | G-10 | **Low** | Additive changes if wrong. |
| A-15 | In-app notifications for all state changes affecting the other party (G-12 list). Email only for account confirmation and reset. | G-12 | **Low** | Adding channels later is additive. Missing customer notifications would stall deals. |
| A-16 | The student profile with experience records is publicly readable by URL without login. It never exposes the email or the customer's identity. | G-14, NFR-05 | **Medium** | If the profile must be private, one access rule flips. If it must be public but more data is shown, privacy review is needed. |
| A-17 | The university domain allow-list is static, seeded once and admin-editable | G-15 | **Medium** | An incomplete list blocks legitimate students at sign-up (onboarding funnel risk), but it is fixable without code changes. |
| A-18 | Verification can be resubmitted after rejection. Status has no expiry. Documents are deleted after the decision plus a retention period. | G-16 | **Medium** | Graduates keeping "beginner" status conflicts with US-41 in the long run. Retention needs legal confirmation. |
| A-19 | Results: several files per submission, executable and script types blocked, every submitted version kept read-only, downloads limited to the executor, the owner customer and moderators | G-13 | **Low** | Validation tweaks only. |
| A-20 | Chat is text-only, opens at assignment, becomes read-only after completion or cancellation, and moderators can read it during a dispute | G-20 | **Low** | Additive changes if wrong. |
| A-21 | Task terms (title, description, price, deadline) cannot be edited once submitted to moderation. A rejected task is re-created. | G-07 | **Low** | Adding an edit-and-resubmit loop later is additive. |
| A-22 | The deadline is informational. It has no automatic transitions on expiry and must be in the future at submission. | G-19, G-07 | **Medium** | If automatic expiry or cancellation is expected, the task lifecycle, escrow refunds and scheduling all change. |
| A-23 | The landing and info content is static. Only the commission value is rendered from configuration (US-03/S3). | US-02/S2, S3, US-03/S3 | **Low** | Moving to a content-management approach later is isolated. |
| A-24 | A mandatory terms and privacy consent at registration. Tax handling is out of scope. | G-21 | **Medium** | If minors or tax obligations need special handling, registration and payout fields change. |
| A-25 | Confirmed university users without the Student role (teachers, staff, rejected applicants) can edit their profile and resubmit verification, but cannot apply or create tasks | G-22 | **Low** | A permission-table change only. |

**Highest-risk items to confirm with stakeholders before design starts:** A-06 (money flow and regulation) and A-09 (disputes and stalled escrow). Then A-01, A-02 and A-08, which shape the role model and the task lifecycle.
