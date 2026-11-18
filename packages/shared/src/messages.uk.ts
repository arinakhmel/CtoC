// Generated from docs/architecture/api.md §3 (default Ukrainian messages). A test compares both.
// The UI keys behaviour on the error code; the message is only a default text.
import type { ErrorCode } from './errors';

export const MESSAGES_UK: Record<ErrorCode, string> = {
  VALIDATION_FAILED: "Перевірте правильність заповнення полів",
  EMAIL_DOMAIN_NOT_ALLOWED: "Дозволено реєстрацію лише з використанням університетської електронної пошти",
  TOKEN_INVALID: "Посилання недійсне",
  TOKEN_EXPIRED: "Термін дії посилання минув. Надіслати лист повторно?",
  FILE_TYPE_NOT_ALLOWED: "Дозволено лише зображення або PDF",
  FILE_TOO_LARGE: "Файл занадто великий. Максимальний розмір — 10 МБ",
  TOO_MANY_FILES: "Забагато файлів у результаті",
  SKILL_EMPTY: "Навичка не може бути порожньою",
  SKILLS_LIMIT: "Досягнуто ліміту навичок (20)",
  BIO_TOO_LONG: "Текст «Про мене» перевищує 500 символів",
  TITLE_TOO_SHORT: "Назва занадто коротка",
  PRICE_BELOW_MIN: "Мінімальна вартість завдання — 50 грн",
  PRICE_ABOVE_MAX: "Ціна перевищує допустимий ліміт",
  DEADLINE_IN_PAST: "Строк має бути в майбутньому",
  NOTE_TOO_LONG: "Записка перевищує допустиму довжину",
  COMMENT_REQUIRED: "Коментар до доопрацювання є обов'язковим",
  COMMENT_TOO_LONG: "Коментар перевищує допустиму довжину",
  MESSAGE_EMPTY: "Повідомлення не може бути порожнім",
  MESSAGE_TOO_LONG: "Повідомлення занадто довге",
  REASON_REQUIRED: "Вкажіть причину відхилення",
  CARD_INVALID: "Невірний формат української банківської картки",
  AUTH_REQUIRED: "Увійдіть, щоб продовжити",
  INVALID_CREDENTIALS: "Невірна пошта або пароль",
  ROLE_FORBIDDEN: "Доступ заборонено",
  ORIGIN_MISMATCH: "Доступ заборонено",
  EMAIL_NOT_CONFIRMED: "Спершу підтвердіть пошту",
  STUDENT_NOT_VERIFIED: "Завершіть верифікацію статусу студента",
  NOT_TASK_OWNER: "Доступ заборонено",
  NOT_EXECUTOR: "Доступ заборонено",
  NOT_CHAT_PARTICIPANT: "Доступ заборонено",
  FILE_FORBIDDEN: "Доступ заборонено",
  NOT_FOUND: "Не знайдено",
  EMAIL_TAKEN: "Ця електронна пошта вже використовується",
  EMAIL_ALREADY_CONFIRMED: "Пошту вже підтверджено",
  VERIFICATION_PENDING: "Ваш документ уже очікує перевірки",
  ALREADY_VERIFIED: "Статус студента вже підтверджено",
  ALREADY_APPLIED: "Ви вже подали відгук на це завдання",
  TASK_NOT_OPEN: "Завдання вже недоступне",
  TASK_ALREADY_ASSIGNED: "Виконавця вже обрано",
  TASK_HAS_EXECUTOR: "Завдання з виконавцем не можна видалити",
  APPLICATION_NOT_PENDING: "Рішення щодо відгуку вже ухвалено",
  RESULT_LOCKED: "Результат на перевірці, редагування заблоковано",
  NO_RESULT_FILES: "Додайте файл результату",
  ALREADY_IN_REVIEW: "Результат уже на перевірці",
  TASK_NOT_IN_REVIEW: "Немає результату на перевірці",
  TASK_ALREADY_DONE: "Угоду вже завершено",
  CHAT_CLOSED: "Чат закрито",
  ALREADY_DECIDED: "Рішення вже ухвалено",
  DOMAIN_EXISTS: "Домен уже є у списку",
  INVALID_TRANSITION: "Дія недоступна в поточному статусі",
  INSUFFICIENT_FUNDS: "Недостатньо коштів",
  INSUFFICIENT_BALANCE: "Недостатньо коштів на балансі для виведення",
  RATE_LIMITED: "Забагато спроб. Спробуйте пізніше",
  INTERNAL_ERROR: "Щось пішло не так. Спробуйте пізніше",
};

/**
 * api.md §3 gives FILE_TYPE_NOT_ALLOWED and FILE_TOO_LARGE one text for documents and another for results (US-27/S2, S3).
 * A code has one text in the dictionary above, so the result upload form takes these two instead.
 */
export const RESULT_FILE_MESSAGES_UK = {
  FILE_TYPE_NOT_ALLOWED: "Цей тип файлу заборонено з міркувань безпеки",
  FILE_TOO_LARGE: "Файл занадто великий. Максимальний розмір — 50 МБ",
} as const;
