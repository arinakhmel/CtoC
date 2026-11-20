# Epic 7. Межі продукту та довіра (наскрізні історії): план і промпти

Історії: **US-39, US-40, US-41, US-42**; торкається також **US-14, US-15, US-18** (перепрогін через справжній publish і справжній approve)

> Розділ 1 описує **фінальний стан** після Епіку 7 (звірено 20.11.2026 з кодом, тестами й `docs/architecture/traceability.md` §5; `main` до Епіку 7 = `7e0c115`, PR #40–#43 змерджено, PR #44 (`epic7/e2e`) відкрито). Початковий стан до роботи: US-39 і US-40 частково (рішення модератора лише через Telegram, `POST /api/tasks` уже завжди `pending_moderation`), US-41 не почато, US-42 зроблено без назв `US-42 sc.N`. Якщо §1 і `traceability.md` розходяться, правий `traceability.md`.

---

## 0. Перед стартом (обов'язково)

1. `git checkout main && git pull`, потім `pnpm install`, `pnpm typecheck && pnpm test`. Усе має бути зеленим **до** змін.
2. Одна історія = одна гілка = один PR у `main`: `epic7/us-39`, `epic7/us-41`, `epic7/us-40`, `epic7/us-42`, `epic7/e2e`. Гілка `epic7` лише для цього файлу плану. Кожна наступна гілка створюється від `main` **після мерджу** попередньої залежної (US-41 після US-39; US-40 теж після US-39, бо обидві гілки правлять `admin/routes.ts`, `notifications/domain.ts`, `NotificationsPage.tsx`, `router.tsx`; e2e після всіх чотирьох).
3. Кожну історію робити через `/implement-story US-xx`. Скіл покаже план і **чекатиме на «так»**. Звір його з розділом 2, перш ніж погоджуватись.
4. Мова UI українська. Тексти помилок беруться з `MESSAGES_UK` (`packages/shared/src/messages.uk.ts`) за `code`, нових текстів помилок у компонентах не вигадувати.

---

## 1. Фінальний стан Епіку 7 (звірено 20.11.2026)

| Історія | Стан у `traceability.md` §5 | Що зроблено | Що лишилось |
|---|---|---|---|
| US-39 ручна перевірка студентських квитків | **done** | `GET /api/mod/verifications`, `POST …/:id/approve` і `/reject` (`api.md` §4.8b); одна функція рішення на web і Telegram (`verification/service.ts`, умовний `updateMany` `WHERE id = requestId AND userId AND status = 'pending'`); бейдж, аудит і сповіщення `verification_approved` / `verification_rejected` в одній транзакції, email після коміту; модератор завантажує лише `student_document` (OQ-43 a); сторінка `/mod/verifications`. Тести: `apps/api/tests/admin/verifications.test.ts` (sc.1–3, гонки, застарілий `:id`, відкат), `telegram.test.ts`, `apps/web/tests/mod-verifications.test.tsx`; e2e тести 1 і 4. | Нічого за сценаріями. Відкрито лише OQ-21 (підтвердити з власником продукту рішення про приватність документів у Telegram) |
| US-40 перевірка завдань перед публікацією | **done** | `GET /api/mod/tasks`, `POST …/:id/publish` (знімок комісії `commission_bp`, `commission_kopecks`, `net_kopecks`, `published_at` одним умовним `updateMany`), `POST …/:id/reject` (причина); сповіщення `task_published` / `task_rejected` в тій самій транзакції (тригер US-49); сторінка `/mod/tasks`. Тести: `apps/api/tests/admin/mod-tasks.test.ts` (sc.1–3, доступ, гонки publish/reject і publish/delete, відкат), `apps/web/tests/mod-tasks.test.tsx`; e2e тести 2 і 3. | Unpublish `published → rejected` (G-17) не збудовано за рішенням (OQ-43 c). Відкрито OQ-43 e (скасування власником після публікації лишає знімок) |
| US-41 без агенцій серед виконавців | **partial** (sc.3 ⚠ W-12) | Лише тести й документи, без коду продукту: `apps/api/tests/admin/us-41-no-agencies.test.ts` (sc.1 і sc.2 через справжні `approve` / `reject`, sc.3 лише технічні правила: замовник 403 `ROLE_FORBIDDEN`, `role: "moderator"` при реєстрації 400 `VALIDATION_FAILED`, неверифікований студент 403 `STUDENT_NOT_VERIFIED`). | Розпізнавання агенції за документом: ручний пункт рев'ю модератора (OQ-15), кодом не перевіряється (W-12) |
| US-42 без власної ціни | **done** | Лише тести, без коду продукту: `apply.test.ts` (sc.1, sc.2), `validate-body.test.ts`, `shared/tests/tasks.test.ts` (sc.2), `apps/web/tests/apply.test.tsx` (sc.1), `task-details.test.tsx` (sc.3), спільний хелпер `apps/web/tests/no-bid-controls.ts`. sc.2 спільний із US-13 sc.2 (W-05: strip, 201). | Нічого |
| US-14 лише перевірені завдання в стрічці | **partial** | sc.1–3 проходять через справжній publish і reject US-40: `apps/api/tests/tasks/moderation-visibility.test.ts`, `mod-tasks.test.ts` | `GET /api/tasks/:id` для власника й модератора непублікованої задачі лишається за US-22 і US-50. Сценарії US-14 покриті; `partial` через цю залежність |
| US-15 чиста сума в картці | **done** | sc.1 через справжній publish (OQ-22 закрито); sc.2 за W-04 (відмова при створенні, 400 `PRICE_BELOW_MIN`, CHECK у БД, `commissionOf`); sc.3 перевіряє розмітку | Макет 390 px перевіряється вручну, не тестом (e2e `finance-mobile.spec.ts` перевіряє 390 px лише для `/me/finance`) |
| US-18 відгук на завдання (Епік 5, не змінювалась) | **done** | Через US-41 його 403 `STUDENT_NOT_VERIFIED` (sc.3) перевірено наскрізно: студента схвалює справжній `approve`, відхиленого `reject` | Нічого |

**Чого в Епіку 7 немає (не будувати):** `POST /api/mod/users/:id/revoke-student` (A-18), `POST /api/mod/tasks/:id/resolve` (A-09, OQ-08), `/mod/settings` і `PUT /api/mod/settings` (US-03, Епік 1), `/api/mod/university-domains` (A-17).

---

## 2. Знайдені проблеми у вимогах і рішення, яких треба дотримуватися

Тексти історій **міняти не можна** (`.claude/rules/input-docs.md`). Кожна нова проблема → рядок `OQ-43…` в `overview.md` §7.2 і, якщо стосується однієї історії, рядок `W-27…` у `traceability.md` §4. У тестах коментар `// W-xx, decided: …`. Усі рішення нижче затверджені остаточно: під час виконання історій додаткових підтверджень не запитувати.

| # | Де | Проблема | Рішення |
|---|---|---|---|
| 1 | US-39 sc.1, sc.2 | Рішення вже приймається з Telegram (OQ-21), а історія вимагає «панель модерації». Два шляхи можуть розійтися в правилах | Один доменний перехід на дві точки входу. У `verification/service.ts` винести спільну функцію рішення (умовний `updateMany` `pending` → `approved/rejected`, бейдж, аудит, сповіщення) і викликати її і з webhook, і з `/api/mod/verifications/*`. **Єдиний контракт:** спільна функція приймає `userId` і необов'язковий `requestId?: string`. Telegram-webhook знає лише `userId` (`decidePending(tx, userId, …)`) і передає тільки його (INV-04: не більше одного `pending` на користувача). Web-сервіс знаходить запит за `:id` (`VerificationRequest.id`; не знайдено → 404 `NOT_FOUND`) і передає **обидва** параметри: умовний `updateMany` іде з `where: { id: requestId, userId, status: 'pending' }`, тож змінюється лише той документ, який бачив модератор; `count` 0 → 409 `ALREADY_DECIDED`. Інакше рішення за застарілим `:id` могло б схвалити новий документ, завантажений після відхилення старого. Відмінності лише в даних аудиту (`via: "web"`, `decidedBy = moderator.id`; у Telegram `decidedBy` лишається `NULL`) і в причині (Telegram: фіксована «Відхилено модератором»). Тести Telegram мають лишитися зеленими |
| 2 | US-39 sc.2 | «Користувач отримує сповіщення про відмову». Зараз іде лише email | У тій самій транзакції рядок `Notification` типу `verification_rejected` з причиною (тип уже є в `NOTIFICATION_TYPES` і в `domain-model.md` §1). Email через порт `Mailer` **після** коміту, його збій рішення не скасовує. Ланцюжок сповіщень до користувача (обов'язково, інакше буде дефолтне «Нове сповіщення» без причини): payload-схеми в `@ctoc/shared` для `verification_rejected` (з `reason`) і `verification_approved`; гілки тексту в `notificationText` (`apps/api/src/modules/notifications/domain.ts`); гілки `linkOf` і відображення тексту в `NotificationsPage` (`apps/web/src/features/notifications/pages/NotificationsPage.tsx`). **Затверджено (A-15):** при approve у тій самій транзакції теж писати `Notification` типу `verification_approved` через `notifyVerificationApproved` у `notifications/service.ts` (тип уже є) |
| 3 | US-39 sc.3 | «403 Forbidden» | Уже вирішено в `api.md`: 401 `AUTH_REQUIRED` без сесії, 403 `ROLE_FORBIDDEN` для будь-якої ролі, крім `moderator` (INV-25). Політика перевіряється **до** валідації query і body (як `requireModerator` в admin) |
| 4 | US-39 | Модератор має бачити документ, а `GET /api/files/:fileId` пускає лише власника і замовника задачі | **Затверджено (OQ-43 a):** модератор отримує доступ лише до файлів `kind = 'student_document'` (мінімум прав, ADR-0006). Файли результатів робіт модератору не віддаються, доки немає A-09. Відповідь та сама: `attachment`, `nosniff`, `no-store` |
| 5 | US-39, US-41 | Що бачить модератор у черзі | `{ id, student: { id, displayName, email }, file: { id, originalName, mime, sizeBytes }, status, reason, createdAt, decidedAt }`. Email модератору потрібен, щоб звірити університетський домен із квитком (так само, як у Telegram-підписі). Найстаріші зверху, максимум 100, `?status=pending` (дефолт) / `approved` / `rejected`. Тіло описати в `api.md` §4 (новий розділ 4.8b) |
| 6 | US-40 sc.1 | Публікація має записати знімок комісії (A-07, INV-08, OQ-22), а налаштувань (US-03) ще немає | У транзакції publish прочитати `Setting` `commission_bp`; якщо рядка немає → `LIMITS.commissionBp.default` (1000). Розрахунок лише `splitPrice` з `@ctoc/shared`. Записати `commission_bp`, `commission_kopecks`, `net_kopecks`, `published_at` тим самим умовним `updateMany` (`WHERE status='pending_moderation'`), що й зміну статусу. Після цього OQ-22 закривається, а US-15 sc.1 і US-14 треба прогнати через справжній publish |
| 7 | US-40, US-15 | `data-model.md` §2 документує CHECK `status = 'pending_moderation' OR commission_bp IS NOT NULL OR status IN ('rejected','cancelled')`, а в міграції `init` його немає | **Затверджено, варіант (B) (OQ-43 b):** таблицю `tasks` у SQLite міграцією **не перебудовувати**. Оновити `data-model.md` §2: **уточнити** (не видаляти), що цього CHECK у БД немає, а цілісність знімка комісії для `published` забезпечує доменна транзакція `publish` (умовний `updateMany` пише статус і знімок разом, рішення 6). Зафіксувати це в `overview.md` §7.2 як `OQ-43 b`. Дефолт фабрики `createTask` (`apps/api/tests/helpers/factories.ts`) **не змінювати**: він створює `published` без знімка, і на цьому свідомо стоять `net-price.test.ts:77`, `feed.test.ts:58`, `task-details.test.ts:51`, `finance.test.ts:263` (OQ-39 a). `seed/dev-work.ts` і `e2e/support/finance-seed.ts` уже пишуть знімок |
| 8 | US-40 sc.2 | Діаграма станів має `published → rejected` (G-17, «unpublish»), `api.md` дає для reject `409 TASK_HAS_EXECUTOR`, а INV-24 каже, що рішення застосовне лише до `pending_moderation` | **Затверджено (OQ-43 c):** у MVP `publish` і `reject` застосовні лише зі стану `pending_moderation` (INV-24). Повторний клік або будь-який інший стан → 409 `ALREADY_DECIDED` (сюди ж гонка двох модераторів). Unpublish `published → rejected` (G-17) не будувати, `TASK_HAS_EXECUTOR` для цього ендпоінта зафіксувати в `api.md` як недосяжний у MVP |
| 9 | US-40 sc.2 | «Завдання блокується і не потрапляє до стрічки» | Статус `rejected` + `moderationReason` (1–500 символів, `moderationRejectSchema`). Без причини → 400 `REASON_REQUIRED`, статус не змінюється, сповіщення немає (це ж US-49 sc.3) |
| 10 | US-40 sc.3 | «Автоматично отримує статус «На перевірці»», а внутрішній статус `pending_moderation` з підписом «На модерації» (OQ-03) | Уже вирішено й протестовано (INV-05). Тест лише перейменувати/додати з назвою `US-40 sc.3`, без нового коду. У коментарі послатися на OQ-03 |
| 11 | US-40 | Публікація задачі з минулим дедлайном або задачі, яку власник скасував, поки модератор дивився | Скасована власником → `status` уже не `pending_moderation` → 409 `ALREADY_DECIDED` (умовний update, тест на гонку `DELETE` проти publish). Дедлайн у минулому: **затверджено (OQ-43 d)** публікація дозволена, у стрічку вона однаково не потрапляє (INV-06); у черзі `/mod/tasks` дедлайн підсвічується червоним |
| 12 | US-40 / US-49 | Сповіщення замовнику `task_published` / `task_rejected` належать US-49 (Епік 8), але тригер (publish/reject) будується тут | Записувати сповіщення в тій самій транзакції вже в цьому PR (через `notifications/service`), бо інакше Епіку 8 доведеться відкривати транзакцію наново. Тексти з рядка US-49 у traceability: «Ваше завдання «Назва» опубліковано», «…відхилено. Причина: …». Ланцюжок сповіщень до користувача (обов'язково, інакше буде дефолтне «Нове сповіщення» без причини): payload-схеми в `@ctoc/shared` для `task_published` і `task_rejected` (з `reason`); гілки тексту в `notificationText` (`apps/api/src/modules/notifications/domain.ts`); гілки `linkOf` і відображення тексту в `NotificationsPage` (`apps/web/src/features/notifications/pages/NotificationsPage.tsx`). Повідомити власника Епіку 8, що тригер готовий, і позначити US-49 у §5 як `partial`, якщо його UI ще не зроблено |
| 13 | US-41 sc.3 | «Технічні правила унеможливлюють участь комерційних підрядників»: кодом не перевіряється (W-12, OQ-15) | Тест `US-41 sc.3` перевіряє **ті правила, що існують**: замовник не може відгукнутися (403 `ROLE_FORBIDDEN`), неверифікований студент не може (403 `STUDENT_NOT_VERIFIED`), модератора не можна зареєструвати: `registerSchema` (`packages/shared/src/schemas/auth.ts`) є `discriminatedUnion` лише між `student` і `customer`, тому `role: "moderator"` у тілі реєстрації дає **400 `VALIDATION_FAILED`** (не 201 і не «вирізається»), користувача не створено. Людську частину (модератор розпізнає агенцію) записати пунктом ручного рев'ю в `traceability.md` §4 W-12, сценарій лишається ⚠ |
| 14 | US-42 sc.2 vs US-13 sc.2 | «Ігнорує або відхиляє»: W-05 | Уже вирішено: вирізати й повернути 201. Тест має називатися `US-42 sc.2` (можна додати до наявного `describe` в `apply.test.ts`, не дублюючи логіку) і перевіряти, що збережений відгук не має ціни, а ціна задачі незмінна |

---

## 3. План (5 PR, порядок важливий)

Одна історія = одна гілка = один PR. Кроки 2 і 3 стартують лише після мерджу кроку 1 (US-41 перевіряє роботу US-39 через справжні ендпоінти; US-40 правлять ті самі файли, що й US-39). Крок 5 стартує після мерджу кроків 1–4.

| Крок | Гілка | Історія | Що | Готово, коли |
|---|---|---|---|---|
| 1 | `epic7/us-39` | US-39 | Модерація студентських квитків: `GET/POST /api/mod/verifications*`, спільна функція рішення з Telegram, сповіщення `verification_rejected`, доступ модератора до `student_document`, сторінка `/mod/verifications` | 3 сценарії US-39 мають тести `US-39 sc.N`, гонка двох рішень, відкат, Telegram-тести зелені, рядок US-39 у §5 → `done`. **Виконано, PR #40** |
| 2 | `epic7/us-41` | US-41 | Лише тести й документи поверх змердженого US-39 і наявного US-18: `US-41 sc.1`, `sc.2`, `sc.3` (W-12), оновлення §5 і §4 W-12 | 3 сценарії, `/check-story US-41` без «not covered», крім sc.3 ⚠ [DESIGN]. **Виконано, PR #41** (рядок §5 лишається `partial`, W-12) |
| 3 | `epic7/us-40` | US-40 | Модерація завдань: API зі знімком комісії, виправлення `data-model.md` §2 (без міграції, OQ-43 b), сповіщення US-49, сторінка `/mod/tasks` | 3 сценарії US-40, повторно через publish: US-14 sc.1–3, US-15 sc.1; гонки publish/reject і publish/delete; US-15 у §5 → `done`, US-14 → `partial` (черга `/mod/tasks` є, читання неопублікованої задачі модератором через `GET /api/tasks/:id` лишається за US-22). **Виконано, PR #42** |
| 4 | `epic7/us-42` | US-42 | Лише тести й документи: назви `US-42 sc.N`, UI-перевірка відсутності елементів аукціону | 3 сценарії, `/check-story US-42` без «not covered». **Виконано, PR #43** |
| 5 | `epic7/e2e` | усі чотири | `e2e/support/finance-seed.ts`: сесія модератора через наявний `userWithSession('moderator', …)`, а студента верифікує і задачу публікує модератор **через API**, а не прямим записом у БД; новий `e2e/moderation.spec.ts`; фінальна перевірка епіка | `pnpm test:e2e` зелений, `/check-story` по 4 історіях, `architecture-reviewer` без blocker. **Виконано, PR #44 (відкритий)**. Сід акаунтів і сесій напряму в БД (`userWithSession`, через ліміт реєстрації), решта через API; назви e2e `Journey …`; оновлено `testing.md` §2 і §5 |

### Файли по кроках

**Крок 1 (US-39)**
- `packages/shared/src/schemas/*`: `modVerificationsQuerySchema` (`status`, дефолт `pending`). `moderationRejectSchema` уже є, перевикористати. Типи відповіді черги.
- `packages/shared/src/index.ts`: експорт.
- `apps/api/src/modules/verification/{domain,repo,service,serializer}.ts`: стани переходу в `domain.ts`, спільна функція рішення, `listForModeration`, серіалізатор черги.
- `packages/shared/src/schemas/*`: payload-схеми `verification_rejected` (з `reason`) і `verification_approved`; експорт в `index.ts`.
- `apps/api/src/modules/notifications/service.ts`: `notifyVerificationRejected` і `notifyVerificationApproved` (обидва затверджено, A-15); `apps/api/src/modules/notifications/domain.ts`: гілки `notificationText` для цих типів.
- `apps/web/src/features/notifications/pages/NotificationsPage.tsx`: `linkOf` і відображення тексту (причина відмови); тест у `apps/web/tests/notifications.test.tsx` або наявному файлі сповіщень.
- `apps/api/src/modules/admin/{routes,service,serializer}.ts`: `/mod/verifications*` через `requireModerator`, виклики лише сервісу verification (ADR-0002).
- `apps/api/src/modules/delivery/policy.ts` (+ `repo.ts`/`service.ts` файлів): модератор і `student_document`.
- `apps/web/src/features/admin/pages/VerificationsQueuePage.tsx`, `apps/web/src/features/admin/queries/verifications.ts`, `apps/web/src/app/router.tsx` (`IMPLEMENTED`).
- Тести: `apps/api/tests/admin/verifications.test.ts`, `apps/api/tests/verification/telegram.test.ts` (лишається зеленим), `apps/web/tests/mod-verifications.test.tsx`, `apps/web/tests/pages.test.tsx` (сторінка вже не заглушка).
- Документи: `api.md` §1 (рядки, коди), §4.8b (новий: тіла черги і рішень), рядок `/api/files/:fileId`; `domain-model.md` §1 (сповіщення), §3.2, якщо змінився перехід; `integrations.md` (Telegram більше не єдиний шлях); `overview.md` §7.2 OQ-21 (екрани модератора тепер є), OQ-43 (a); `traceability.md` §5 (US-39).

**Крок 2 (US-41)**
- Нових файлів продукту немає. Тести: `apps/api/tests/admin/us-41-no-agencies.test.ts` (новий; фактичний шлях; наскрізно через `/api/mod/verifications/*` з кроку 1 і `POST /api/tasks/:id/applications`), за потреби `apps/api/tests/identity/register.test.ts` (`role: "moderator"` у тілі реєстрації → 400 `VALIDATION_FAILED`, якщо такого тесту ще немає).
- Документи: `traceability.md` §5 (US-41), §4 W-12 (автоматизована технічна частина і ручний пункт рев'ю), за потреби `overview.md` OQ-15.

**Крок 3 (US-40)**
- `packages/shared/src/schemas/task.ts`: `modTasksQuerySchema`.
- `apps/api/src/modules/tasks/{domain,repo,service,serializer}.ts`: `PUBLISHABLE_STATUS`, `REJECTED`, знімок комісії, `listForModeration`.
- `packages/shared/src/schemas/*`: payload-схеми `task_published` і `task_rejected` (з `reason`); експорт в `index.ts`.
- `apps/api/src/modules/notifications/service.ts`: `notifyTaskPublished`, `notifyTaskRejected`; `apps/api/src/modules/notifications/domain.ts`: гілки `notificationText` («Ваше завдання «Назва» опубліковано», «…відхилено. Причина: …»).
- `apps/web/src/features/notifications/pages/NotificationsPage.tsx`: `linkOf` (посилання на `/c/tasks/:id`) і відображення тексту; тест у наявному файлі сповіщень.
- `apps/api/src/modules/admin/*`: `/mod/tasks*`.
- `apps/api/tests/helpers/factories.ts`: дефолт `createTask` **не змінювати** (рішення 7). Тести `net-price.test.ts:77`, `feed.test.ts:58`, `task-details.test.ts:51` і `finance.test.ts:263` лишаються як є. `seed/dev-work.ts` і `e2e/support/finance-seed.ts` уже пишуть знімок; `finance-seed.ts` переходить на реальний `POST /api/mod/tasks/:id/publish` у кроці 5.
- `apps/web/src/features/admin/pages/TasksQueuePage.tsx`, `queries/tasks.ts`, `router.tsx`.
- Тести: `apps/api/tests/admin/mod-tasks.test.ts` (фактична назва), `apps/api/tests/tasks/moderation-visibility.test.ts` і `net-price.test.ts` (через справжній publish), `apps/web/tests/mod-tasks.test.tsx`, `apps/web/tests/pages.test.tsx` (додати `/mod/tasks` до `IMPLEMENTED_PAGES`, інакше тест заглушок упаде).
- Документи: `api.md` §1, §4 (новий розділ тіл), `data-model.md` §2 (уточнити: знімок для `published` гарантує транзакція `publish`, а не DB CHECK), `domain-model.md` §3.1 (G-17 відкладено), `overview.md` OQ-22 (закрито), OQ-43 (b–d), `traceability.md` §5 (US-40 і US-15 → `done`, US-14 → `partial`: читання неопублікованої задачі модератором через `GET /api/tasks/:id` лишається за US-22; US-49).

**Крок 4 (US-42)**
- `apps/api/tests/applications/apply.test.ts`, `apps/web/tests/apply.test.tsx`, `apps/web/tests/task-details.test.tsx` (sc.3 для стрічки й картки), спільний хелпер `apps/web/tests/no-bid-controls.ts`, `packages/shared/tests/tasks.test.ts`, `validate-body.test.ts`.
- `traceability.md` §5 (US-42).

**Крок 5 (e2e)**
- `e2e/support/finance-seed.ts` (акаунти й сесії, зокрема модератор, лишаються прямими записами в БД через `userWithSession`, бо `POST /api/auth/register` обмежений 10 реєстраціями на годину; студента верифікують завантаження документа і схвалення модератором через API, задачу створює замовник і публікує модератор через API, тож знімок комісії реальний; виконавець, escrow і результат `in_review` досі пишуться в БД; параметр `commissionKopecks` прибрано; застарілі коментарі виправлено), новий `e2e/support/moderation-api.ts` (виклики API з сесіями), новий `e2e/moderation.spec.ts`, виклики `seedTasksInReview(request, …)` у `payout-and-experience.spec.ts` і `finance-mobile.spec.ts`.
- `docs/architecture/testing.md`: §2 (префікс `US-xx sc.N` для тестів `shared`, `web`, `api`; e2e називаються `Journey <name>: …` з коментарем про історії), §5 (акаунти й сесії сідяться в БД через `userWithSession`, подальші дії через реальні API).

### Правила, обов'язкові для кожного кроку (з `CLAUDE.md` і ADR)

- Помилки лише `throw new ApiError('CODE')`. Усі потрібні коди вже є в `api.md` §3 (`REASON_REQUIRED`, `ROLE_FORBIDDEN`, `ALREADY_DECIDED`, `NOT_FOUND`, `FILE_FORBIDDEN`). Якщо все ж потрібен новий код, додати його **водночас** в `api.md` §3, `ERROR_STATUS` (`packages/shared/src/errors.ts`) і `MESSAGES_UK`, інакше впаде `packages/shared/tests/docs-sync.test.ts`.
- Новий тип сповіщення або статус → `domain-model.md` §1/§3 у тому самому PR (той самий `docs-sync.test.ts`).
- Сторінки `/mod/verifications`, `/mod/tasks` уже є в `routes.config.ts` і `overview.md` §4. Якщо змінюється назва, доступ або перелік історій сторінки, міняти **обидва** файли разом (`apps/web/tests/routes-config-docs-sync.test.ts`).
- Кожне рішення модератора = одна `prisma.$transaction`: умовний `updateMany` з перевіркою `count` (0 → `ALREADY_DECIDED` або `NOT_FOUND`, якщо рядка немає), потім бейдж/знімок, аудит (`actorId` = модератор), сповіщення. Ніякого read-decide-write (ADR-0007, INV-24).
- Статуси змінюються лише через константи `domain.ts` свого модуля. `admin` не пише в чужі таблиці, лише викликає сервіси (ADR-0002).
- UI: фіча `features/admin`, один api-клієнт, ролі й мітки для Testing Library, `role="alert"` для помилок, кнопки неактивні під час запиту (`.claude/rules/web.md`, ADR-0008). Підпис статусу задачі «На модерації» (OQ-03).

---

## 4. Промпти для Claude Code

Вставляти по одному, у новій сесії, у корені репозиторію, на свіжій гілці від актуальної `main`. `/implement-story` уже містить загальний процес. Промпт додає те, чого скіл не знає: рішення з розділу 2 і вимоги до тестів.

### Промпт 7.1: US-39 (модерація студентських документів)

```text
/implement-story US-39

# КОНТЕКСТ
Гілка epic7/us-39, закриваю лише US-39. US-41 робиться окремою гілкою epic7/us-41 після мерджу цієї (промпт 7.2).
Рішення модератора вже існує тільки через Telegram (apps/api/src/modules/verification/service.ts, handleTelegramUpdate,
api.md §4.8a, OQ-21). Політика модератора вже є: apps/api/src/modules/admin (assertModerator, requireModerator),
зразок — /mod/withdrawals. Прочитай: traceability.md рядок US-39; api.md §1 «Moderation and admin», §3, §4.8, §4.8a;
domain-model.md INV-03, INV-04, INV-24, INV-25, §1 Notification, §3.2; ADR-0002, ADR-0006, ADR-0007; testing.md §4.

# ЗАВДАННЯ
1. Спочатку допиши в api.md новий §4.8b: тіла GET /api/mod/verifications?status=pending|approved|rejected (дефолт pending,
   найстаріші зверху, максимум 100; елемент { id, student: { id, displayName, email }, file: { id, originalName, mime, sizeBytes },
   status, reason, createdAt, decidedAt }) і POST /api/mod/verifications/:id/approve | /reject { reason } → { verification: … }.
2. Один доменний перехід на дві точки входу. У модулі verification винеси спільну функцію рішення (умовний updateMany
   pending → approved/rejected, markStudentVerified при approve, audit event, сповіщення) і виклич її і з webhook Telegram,
   і з нового сервісу. Єдиний контракт: функція приймає userId і необов'язковий requestId?: string. Telegram передає лише userId
   (webhook знає тільки його; INV-04). Web-сервіс знаходить запит за :id (VerificationRequest.id; не знайдено → 404 NOT_FOUND) і передає
   обидва: updateMany where { id: requestId, userId, status: 'pending' }, count 0 → 409 ALREADY_DECIDED. Так змінюється лише документ,
   який бачив модератор. Web-шлях пише decidedBy = id модератора і audit { via: "web" }; Telegram лишає decidedBy NULL і свою фіксовану причину.
   Стани переходу — константи в verification/domain.ts.
3. Ендпоінти в admin/routes.ts через requireUser + requireModerator ДО validateQuery/validateBody. admin/service викликає лише
   сервіс verification (ADR-0002). count 0 → 409 ALREADY_DECIDED; невідомий id → 404 NOT_FOUND. Reject без причини → 400 REASON_REQUIRED
   (moderationRejectSchema з @ctoc/shared, не нова схема).
4. US-39 sc.2: у тій самій транзакції Notification `verification_rejected` з причиною (notifications/service, новий notifyVerificationRejected).
   Щоб студент бачив причину: додай payload-схеми verification_rejected (з reason) і verification_approved у @ctoc/shared, гілки тексту
   у notificationText (apps/api/src/modules/notifications/domain.ts; інакше буде «Нове сповіщення») і гілки linkOf та відображення тексту
   в NotificationsPage (apps/web/src/features/notifications/pages/NotificationsPage.tsx).
   Email (наявний sendResultEmail через порт Mailer) — після коміту, його збій не скасовує рішення.
   Сповіщення verification_approved (A-15, затверджено): створи notifyVerificationApproved у notifications/service.ts і при approve
   записуй Notification типу verification_approved у тій самій транзакції, що й бейдж.
5. GET /api/files/:fileId: модератор отримує доступ лише до файлів kind='student_document' (OQ-43 a, мінімум прав, ADR-0006).
   Інші файли модератору — 403 FILE_FORBIDDEN. Онови рядок api.md §1 і коментар у delivery/policy.ts.
6. Сторінка /mod/verifications (features/admin/pages/VerificationsQueuePage.tsx + queries/verifications.ts, зареєструвати в IMPLEMENTED
   у router.tsx). Список: ім'я, email, дата, посилання «Переглянути документ» (/api/files/:fileId), кнопка «Схвалити»,
   «Відхилити» відкриває поле причини з кнопкою підтвердження. Помилки за code з MESSAGES_UK, role="alert". Після рішення рядок зникає з черги.
   Статус pending показувати як «Очікує перевірки» (W-14). Тексти українською.
7. Документи: overview.md §7.2 — онови OQ-21 (екрани модератора тепер є) і додай OQ-43 (a: доступ модератора до файлів;
   пункти b–d додасть US-40); integrations.md (Telegram — додатковий, не єдиний шлях); traceability.md §5 рядок US-39.

# ТЕСТИ (по одному на сценарій, назва `US-xx sc.N …`)
- US-39 sc.1 [API]: модератор схвалює → 200, request approved, studentVerifiedAt встановлено, GET /api/profiles/:id → verified: true,
  audit із actorId модератора, є Notification verification_approved для цього студента, а GET /api/me/notifications (сесія студента) повертає його з текстом. Customer і неверифікований інший студент статусу не отримали.
- US-39 sc.2 [API]: reject з причиною → 200, роль не присвоєна (studentVerifiedAt NULL), є Notification verification_rejected із причиною,
  GET /api/me/notifications (сесія студента) повертає його з текстом, що містить причину (а не «Нове сповіщення»), mailer отримав лист. Без причини / пробіли → 400 REASON_REQUIRED, нічого не змінилося.
- US-39 sc.3 [API]: студент → 403 ROLE_FORBIDDEN на GET і обох POST, замовник → 403, без сесії → 401 AUTH_REQUIRED.
  Студент із невалідним body теж 403 (політика раніше за валідацію).
- Гонка (testing.md §4): два паралельні approve / approve+reject → рівно один 200, інший 409 ALREADY_DECIDED, один audit.
- Гонка за застарілим :id: запит A відхилено, студент завантажив новий документ B (pending) → approve або reject за :id запиту A
  → 409 ALREADY_DECIDED, запит B лишився pending, бейджа немає.
- Відкат (testing.md §4): vi.spyOn(<repo вставки сповіщення>).mockRejectedValueOnce(...) → відповідь 500 INTERNAL_ERROR,
  request лишився pending, бейджа немає, сповіщення й audit немає.
- Повторне рішення через Telegram після web-рішення → «Already decided», нічого не змінилось. Усі наявні тести telegram.test.ts зелені.
- Файл: модератор завантажує student_document → 200 attachment; файл результату → 403 FILE_FORBIDDEN.
- [UI] mod-verifications.test.tsx: черга рендериться, «Відхилити» без причини показує REASON_REQUIRED, після «Схвалити» рядок зникає.
- pages.test.tsx: /mod/verifications більше не заглушка.

# ОБМЕЖЕННЯ
- Не змінюй тексти історій у docs/requirements.md. revoke-student (A-18) і university-domains (A-17) НЕ будувати. Тести US-41 НЕ писати: це окрема гілка.
- Тільки ApiError з кодами з api.md §3, тільки схеми з @ctoc/shared. Новий код помилки → api.md §3 + ERROR_STATUS + MESSAGES_UK разом.
- Якщо щось у вимогах суперечить дизайну, додай OQ в overview.md §7.2 і скажи мені, не вирішуй мовчки.
- В кінці: pnpm typecheck і pnpm test зелені, покажи вивід. Потім /check-story US-39.
- Перед комітом запусти агента architecture-reviewer на diff гілки відносно main; blocker-зауваження виправ.
```

### Промпт 7.2: US-41 (без агенцій серед виконавців)

```text
/implement-story US-41

# КОНТЕКСТ
Гілка epic7/us-41. Запускати ЛИШЕ після мерджу epic7/us-39 у main: тести йдуть через справжні ендпоінти
POST /api/mod/verifications/:id/approve і /reject. Власних ендпоінтів US-41 не має, нового коду продукту, найімовірніше, не треба:
правила забезпечують US-39 (ручна модерація документів), US-18 (відгук лише верифікованого студента, 403 STUDENT_NOT_VERIFIED),
US-06 (реєстрація студента лише з університетським доменом). Прочитай: traceability.md рядок US-41 і §4 W-12;
overview.md OQ-15; apps/api/tests/applications/apply.test.ts і apps/api/tests/verification/ (як зразок фабрик).
Якщо знайдеш шлях, яким неверифікований користувач або замовник усе ж може подати відгук, чи змінити роль, — це дефект: виправ мінімально
і скажи мені окремо.

# ЗАВДАННЯ
1. Додай наскрізні тести US-41 (див. нижче), нові файли поруч із наявними, без дублювання фабрик.
2. Онови traceability.md §5 рядок US-41 і §4 W-12: що автоматизовано (технічні правила), що лишилось ручним пунктом рев'ю
   (модератор розпізнає агенцію за документом). Сценарій sc.3 лишається ⚠.
3. Не змінюй тексти історій у docs/requirements.md.

# ТЕСТИ (по одному на сценарій, назва `US-41 sc.N …`)
- US-41 sc.1 [API]: студента схвалено через /api/mod/verifications/:id/approve → його відгук 201; студент без схвалення → 403 STUDENT_NOT_VERIFIED.
- US-41 sc.2 [API]: «документ агенції» відхилено через шлях US-39 sc.2 (з причиною) → відгук цього користувача 403 STUDENT_NOT_VERIFIED,
  бейджа немає (GET /api/profiles/:id → verified: false).
- US-41 sc.3 [API] // W-12, decided: автоматизовано лише технічну частину: замовник не може відгукнутися (403 ROLE_FORBIDDEN),
  `POST /api/auth/register` з `role: "moderator"` → 400 VALIDATION_FAILED (registerSchema — discriminatedUnion лише student | customer),
  користувача в БД немає; неверифікований не може відгукнутися. Розпізнавання агенції — ручне рев'ю,
  це написано в коментарі до тесту.

# ОБМЕЖЕННЯ
- Тільки ApiError з кодами з api.md §3, тільки схеми з @ctoc/shared. Нових ендпоінтів, таблиць і кодів помилок не додавати.
- Якщо щось у вимогах суперечить дизайну, додай OQ в overview.md §7.2 і скажи мені, не вирішуй мовчки.
- В кінці: pnpm typecheck і pnpm test зелені, покажи вивід. Потім /check-story US-41.
- Перед комітом запусти агента architecture-reviewer на diff гілки відносно main; blocker-зауваження виправ.
```

### Промпт 7.3: US-40 (модерація завдань перед публікацією)

```text
/implement-story US-40

# КОНТЕКСТ
Гілка epic7/us-40. POST /api/tasks уже завжди створює pending_moderation (INV-05, тести US-40 sc.3 в create-task.test.ts).
Ендпоінтів модератора для задач немає: тести US-14 і US-15 засівають published-рядки фабрикою, а знімка комісії ніхто не пише (OQ-22, OQ-39 a).
Зразок політики і маршрутів — apps/api/src/modules/admin (/mod/withdrawals) і зроблений у промпті 7.1 /mod/verifications.
Прочитай: traceability.md рядки US-40, US-14, US-15, US-49 і їхні рядки §5; api.md §1 «Moderation and admin», §4.12, §4.13;
domain-model.md INV-05, INV-06, INV-08, INV-24, §3.1; data-model.md tasks; ADR-0007.

# ЗАВДАННЯ
1. Спочатку api.md §4: тіла GET /api/mod/tasks?status=pending_moderation (дефолт; також published|rejected), найстаріші зверху, максимум 100,
   елемент { id, title, description, priceKopecks, deadlineAt, customer: { id, displayName }, status, moderationReason, createdAt };
   POST /api/mod/tasks/:id/publish (порожнє тіло) і /reject { reason } → { task: … }.
2. publish: одна транзакція. Прочитай Setting commission_bp (немає рядка → LIMITS.commissionBp.default), splitPrice з @ctoc/shared,
   і одним умовним updateMany WHERE status='pending_moderation' запиши status published, commission_bp, commission_kopecks, net_kopecks,
   published_at. count 0 → 409 ALREADY_DECIDED (повтор, гонка, задачу вже скасував власник); невідомий id → 404 NOT_FOUND.
   Audit task.published, Notification замовнику task_published «Ваше завдання «Назва» опубліковано» (US-49 тригер) у тій самій транзакції.
   Ланцюжок до користувача: payload-схеми task_published і task_rejected (з reason) у @ctoc/shared, гілки у notificationText
   (apps/api/src/modules/notifications/domain.ts), linkOf (/c/tasks/:id) і текст у NotificationsPage; інакше буде «Нове сповіщення».
3. reject: умовний updateMany pending_moderation → rejected + moderation_reason (moderationRejectSchema, без причини 400 REASON_REQUIRED),
   audit, Notification task_rejected «…відхилено. Причина: …». OQ-43 c, затверджено: unpublish published → rejected (G-17) НЕ будувати;
   у api.md прибери/познач TASK_HAS_EXECUTOR для цього ендпоінта як недосяжний у MVP і онови domain-model.md §3.1.
4. Статуси і перехід — константи в tasks/domain.ts. admin викликає лише tasks/service і notifications/service (ADR-0002).
5. CHECK зі data-model.md §2 (status = 'pending_moderation' OR commission_bp IS NOT NULL OR status IN ('rejected','cancelled')),
   затверджено варіант (B), OQ-43 b: НЕ додавати міграцію і НЕ перебудовувати таблицю tasks. Уточни data-model.md §2 (не видаляй рядок):
   цього CHECK у БД немає, цілісність знімка комісії для published гарантує доменна транзакція publish (пункт 2), а не DB CHECK. Запиши рішення в overview.md §7.2 як OQ-43 b.
6. Сторінка /mod/tasks (features/admin/pages/TasksQueuePage.tsx + queries/tasks.ts, IMPLEMENTED у router.tsx): назва, опис, ціна
   (наявний хелпер грошей із копійок), дедлайн (минулий — виділити, OQ-43 d), замовник; «Опублікувати», «Відхилити» з полем причини.
   Статус pending_moderation підписаний «На модерації» (OQ-03). Помилки за code, role="alert", кнопки неактивні під час запиту.
7. Документи: overview.md OQ-22 → закрито (знімок пишеться при публікації), OQ-43 b–d; traceability.md §5: US-40 → done, US-15 → done
   (знімок тепер є), US-14 → partial (чергу закриває /mod/tasks, а GET /api/tasks/:id для модератора лишається за US-22, тут не будувати), US-49 (тригер і тексти зроблено, сторінку замовника — за станом Епіку 8).

# ТЕСТИ
- US-40 sc.1 [API]: publish → 200, status published, знімок 1000 грн / 10 % = 100000 / 10000 / 90000, задача є в GET /api/tasks;
  GET /api/me/notifications (сесія замовника) повертає «Ваше завдання «Назва» опубліковано».
- US-40 sc.2 [API]: reject з причиною «домашнє завдання» → 200, status rejected, у стрічці немає, GET /api/tasks/:id студентом → 404;
  GET /api/me/notifications (сесія замовника) повертає текст «…відхилено. Причина: …» з причиною модератора.
  Без причини → 400 REASON_REQUIRED, статус pending_moderation, сповіщення немає.
- US-40 sc.3 [API]: перейменуй/доповни наявний тест: POST /api/tasks зі status "published", commission, executorId → 201, pending_moderation,
  знімка немає. // OQ-03: «На перевірці» = pending_moderation.
- Доступ: студент і замовник → 403 ROLE_FORBIDDEN (до валідації body), без сесії → 401.
- Гонки: publish+publish, publish+reject → один 200, інший 409 ALREADY_DECIDED; publish проти DELETE /api/tasks/:id власником → рівно один виграв;
  явна перевірка інваріанта в БД після гонки: ніколи не cancelled зі знімком комісії (commission_bp/commission_kopecks/net_kopecks) і ніколи не published без знімка.
- Відкат (testing.md §4): vi.spyOn(<repo вставки сповіщення>).mockRejectedValueOnce(...) → відповідь 500 INTERNAL_ERROR,
  задача лишилась pending_moderation без знімка, audit і сповіщення немає.
- US-14 sc.1–3 і US-15 sc.1 перепиши так, щоб задача потрапляла в стрічку через справжній POST /api/mod/tasks/:id/publish, а не фабрикою.
  Дефолт createTask у factories.ts НЕ змінюй: тести net-price.test.ts:77, feed.test.ts:58, task-details.test.ts:51 і finance.test.ts:263
  свідомо перевіряють published-рядок без знімка (варіант B, CHECK-у немає) і лишаються як є.
- pages.test.tsx: додай /mod/tasks до IMPLEMENTED_PAGES (інакше тест заглушок упаде).
- [UI] mod-tasks.test.tsx: черга рендериться, «Відхилити» без причини → REASON_REQUIRED, після «Опублікувати» рядок зникає.

# ОБМЕЖЕННЯ
Ті самі, що в промпті 7.1. /api/mod/tasks/:id/resolve (A-09) і /mod/settings (US-03) НЕ будувати. Ніякого float, лише splitPrice.
В кінці pnpm typecheck і pnpm test зелені, вивід мені, потім /check-story US-40, /check-story US-14, /check-story US-15.
- Перед комітом запусти агента architecture-reviewer на diff гілки відносно main; blocker-зауваження виправ.
```

### Промпт 7.4: US-42 (фіксована ціна, без аукціону)

```text
/implement-story US-42

# КОНТЕКСТ
Гілка epic7/us-42. Поведінка вже реалізована: validateBody вирізає невідомі ключі, тому priceKopecks у тілі відгуку ігнорується
(W-05 вирішено: strip + 201). Тести є, але названі US-13 sc.2 (apps/api/tests/applications/apply.test.ts:249),
validate-body.test.ts:31, packages/shared/tests/tasks.test.ts:98. Форма відгуку і картка без поля ціни перевірені як US-13 sc.1, sc.3.
Код продукту, найімовірніше, не потрібен. Якщо знайдеш у UI будь-який елемент торгу — тоді виправ.

# ЗАВДАННЯ
1. Звір кожен сценарій US-42 з наявними тестами і додай тести з назвами `US-42 sc.N`, не дублюючи логіку (можна спільний хелпер).
2. Онови traceability.md §5 рядок US-42 (і згадку в US-13, що sc.2 спільний).

# ТЕСТИ
- US-42 sc.1 [UI]: на /tasks/:id форма/кнопки «Відгукнутися» і «Відгукнутися із запискою» (W-26) не мають жодного числового поля
  (заборонені лише `spinbutton` та `input[type="number"]`; `textarea` для супровідної записки дозволена) і поля, названого ціною чи бюджетом; [API] відгук створено, задача має ту саму priceKopecks.
- US-42 sc.2 [API]: тіло з priceKopecks: 100 (і budget, bid) → 201, у відповіді й у БД ціни немає, ціна задачі незмінна. // W-05, decided: strip.
- US-42 sc.3 [UI]: стрічка /feed і картка /tasks/:id не містять `spinbutton`, `input[type="number"]` і поля, названого ціною, а також текстів «ставк», «торг», «запропонувати ціну»,
  «аукціон» (регістронезалежно, getByRole/queryByText). Критерій числових полів: заборонені лише `spinbutton` та `input[type="number"]`, `textarea` записки дозволена (`allowNote` у `expectNoBidControls`, `apps/web/tests/no-bid-controls.ts`; на стрічці й картці без відкритої записки текстових полів немає взагалі).

# ОБМЕЖЕННЯ
Ті самі, що в промпті 7.1. Не перемикай схеми в strict mode (це рішення W-05). В кінці pnpm typecheck, pnpm test, /check-story US-42.
- Перед комітом запусти агента architecture-reviewer на diff гілки відносно main; blocker-зауваження виправ.
```

### Промпт 7.5: e2e і фінальна перевірка епіка

```text
/e2e-tests moderation

# ЗАВДАННЯ
Гілка epic7/e2e.
1. e2e/support/finance-seed.ts зараз пише verified-студента і published-задачу прямо в БД, бо US-39 і US-40 не мали API
   (коментарі в рядках 7–8 і в e2e/payout-and-experience.spec.ts:8). Тепер переведи ці два кроки на справжні виклики:
   акаунти й сесії (студент, замовник, модератор) створює наявний e2e-хелпер userWithSession(role, …) у finance-seed.ts напряму в БД
   (seedModerator для модератора, не pnpm db:seed), бо POST /api/auth/register обмежений 10 реєстраціями на годину;
   студент спершу завантажує документ через POST /api/me/verification (multipart, зі своєю сесією), а потім модератор через API
   (зі своєю сесією) схвалює саме цей запит, а замовник створює задачу і модератор публікує її через API (знімок комісії тепер реальний,
   тож параметр commissionKopecks із seedTasksInReview прибрати). Виконавець, escrow і результат in_review лишаються записом у БД.
   Виправ застарілі коментарі. Допоміжні виклики API винеси в e2e/support/moderation-api.ts.
2. Новий e2e/moderation.spec.ts (кроки 3 і 5 User Journey, overview.md §5). Окремі test(...)-блоки в одному test.describe,
   у кожному лише ОДИН основний крок у браузері, усе до нього — seed через API (скіл /e2e-tests, testing.md §5):
   - test 1 (US-39): seed — студент завантажив квиток через API; браузер — модератор на /mod/verifications натискає «Схвалити»;
     перевірка — у профілі студента бейдж.
   - test 2 (US-40 sc.1): seed — замовник створив задачу через API; браузер — модератор на /mod/tasks «Опублікувати»;
     перевірка — студент бачить її в /feed з net-ціною.
   - test 3 (US-40 sc.2): seed — друга задача через API; браузер — модератор «Відхилити» з причиною;
     перевірка — у стрічці її немає, у замовника сповіщення з причиною.
   - test 4 (US-39 sc.3): браузер — студент відкриває /mod/verifications; перевірка — елемент role="alert" з текстом «Доступ заборонено»
     (відповідь 403 ROLE_FORBIDDEN). Окремої «сторінки відмови» і route guard'ів у web немає, їх не будувати.
   Локатори лише getByRole/getByLabel/getByText. Назви e2e-тестів у форматі `Journey moderation: …` (не `US-xx sc.N`), історії й сценарії в коментарі над тестом.
3. Онови docs/architecture/testing.md: §2 (префікс `US-xx sc.N` лише для тестів shared, web, api; e2e називаються `Journey <name>: …`),
   §5 (акаунти й сесії сідяться в БД через userWithSession, подальші дії через реальні API).

Після цього (результат: усе зелене; нову e2e-перевірку 4 тестів проходить стабільно):
1. /check-story для US-39, US-40, US-41, US-42 (і US-14, US-15). Жодного «not covered», крім US-41 sc.3 ⚠ W-12 [DESIGN].
2. Агент architecture-reviewer на diff усіх гілок Епіку 7 відносно main.
3. pnpm typecheck, pnpm test, pnpm test:e2e: покажи вивід.
4. Таблицею: що зроблено, що лишилось відкритим (OQ-21, OQ-43 a–d, W-12) і чому.
```

### Промпт 7.6: AI code review (лише читання)

```text
AI code review: epic7 vs main (read-only)
Do not edit, commit or push. Review the full diff of git diff origin/main...<branch>.

Check against the repo's own rules (read CLAUDE.md, docs/adr/, docs/architecture/):
access: ADR-0006, INV-25 — every /api/mod/* route has requireUser + requireModerator before validation; 401/403/404 as in api.md;
the moderator reads only student_document files;
state: ADR-0007, INV-24 — every decision is one transaction with a conditional updateMany and the count checked, first decision wins,
409 ALREADY_DECIDED on repeat; statuses change only through domain.ts; Telegram and web share one decision function;
money: the commission snapshot is written in the publish transaction with splitPrice only, INV-08 holds, no float, rate from Setting or the default;
structure: ADR-0002 — admin calls only services of verification, tasks, notifications; no cross-module repo access;
notifications: verification_rejected, task_published, task_rejected written in the same transaction; email after the commit;
tests: one test per Gherkin scenario named `US-xx sc.N`, race and rollback tests for every decision, Telegram tests still green, no .only/.skip;
docs: api.md §1, §3, §4, domain-model.md, data-model.md, overview.md OQ-21/OQ-22/OQ-43, traceability.md §4 and §5 updated in the same PR;
docs-sync.test.ts and routes-config-docs-sync.test.ts still green.

Output a table: ID, severity (blocker / major / minor), file:line, problem, rule violated, concrete fix. Group by severity.
If a category is clean, say so explicitly.
```

---

## 5. Чек-лист «Епік 7 зроблено ідеально» (стан на 20.11.2026)

- [x] 12 сценаріїв (4 історії × 3) мають тести з назвою `US-xx sc.N`; US-41 sc.3 лишається ⚠ W-12 з автоматизованою технічною частиною (`/check-story` по US-39, US-40, US-41, US-42, US-14, US-15: покрито 22 з 25 рядків, 3 частково: US-41 C1, US-41 sc.3, US-15 sc.3)
- [x] Гонки й відкат для кожного рішення модератора (approve, reject документа; publish, reject задачі; publish проти delete власника)
- [x] Telegram і web-панель використовують одну функцію рішення; тести Telegram зелені
- [x] Знімок комісії пишеться при публікації (OQ-22 закрито); US-14 і US-15 sc.1 проходять через справжній publish
- [x] `data-model.md` §2 виправлено (CHECK на `commission_bp` у БД не додається, OQ-43 b), міграцій для `tasks` немає
- [x] `api.md`, `domain-model.md`, `data-model.md`, `overview.md` §7.2, `traceability.md` §4 і §5, `testing.md` §2 і §5 оновлені в тих самих PR
- [x] `docs-sync.test.ts` і `routes-config-docs-sync.test.ts` зелені
- [x] `pnpm typecheck`, `pnpm test` (shared 107, web 313, api 666), `pnpm test:e2e` (7 passed) зелені
- [x] `architecture-reviewer` без blocker. Одне зауваження «варто виправити»: `admin/routes.ts` імпортує серіалізатори `tasks` і `verification` (ADR-0002 §4); свідомо винесено за межі Епіку 7 як косметичне покращення
- [ ] 5 PR у `main`: `epic7/us-39` (#40), `epic7/us-41` (#41), `epic7/us-40` (#42), `epic7/us-42` (#43) змерджено; `epic7/e2e` (#44) відкрито, чекає мерджу

### Відкриті питання на кінець Епіку 7

| Питання | Поточний статус | Чому |
|---|---|---|
| OQ-21 (Telegram для модераторів) | **відкрито**, web-екрани збудовано (основний шлях), Telegram додатковий | Лишилось підтвердити з власником продукту рішення про приватність: документи студентів надсилаються третій стороні |
| OQ-43 a (файли для модератора) | **закрито** | Модератор завантажує лише `student_document`, інші файли 403 `FILE_FORBIDDEN` |
| OQ-43 b (CHECK знімка комісії) | **закрито**, варіант B | Без міграції; `data-model.md` §2 каже, що CHECK у БД немає, знімок гарантує транзакція `publish`. Рев'юер просив підтвердити виняток з ADR-0004 |
| OQ-43 c (unpublish G-17, `TASK_HAS_EXECUTOR`) | **закрито**, не збудовано | `publish` і `reject` застосовні лише з `pending_moderation` (INV-24); `TASK_HAS_EXECUTOR` недосяжний у MVP |
| OQ-43 d (минулий дедлайн) | **закрито** | У черзі позначається «дедлайн минув», публікація дозволена, у стрічку задача не потрапляє (INV-06) |
| OQ-43 e (скасування після публікації) | **відкрито** | Скасована після публікації задача лишає знімок; рішення за власником продукту (див. `overview.md` §7.2) |
| W-12 (US-41 sc.3) | **відкрито за дизайном** | Кодом не перевіряється, автоматизовано лише технічні правила; розпізнавання агенції лишається ручним пунктом рев'ю (OQ-15) |
