// Generated from docs/architecture/api.md §3 (error code dictionary). Keep in sync: a test compares both.
// HTTP status per machine-readable error code. The UI keys behaviour and text on the code, not on the message.
export const ERROR_STATUS = {
  VALIDATION_FAILED: 400,
  EMAIL_DOMAIN_NOT_ALLOWED: 400,
  TOKEN_INVALID: 400,
  TOKEN_EXPIRED: 400,
  FILE_TYPE_NOT_ALLOWED: 400,
  FILE_TOO_LARGE: 400,
  TOO_MANY_FILES: 400,
  SKILL_EMPTY: 400,
  SKILLS_LIMIT: 400,
  BIO_TOO_LONG: 400,
  TITLE_TOO_SHORT: 400,
  PRICE_BELOW_MIN: 400,
  PRICE_ABOVE_MAX: 400,
  DEADLINE_IN_PAST: 400,
  NOTE_TOO_LONG: 400,
  COMMENT_REQUIRED: 400,
  COMMENT_TOO_LONG: 400,
  MESSAGE_EMPTY: 400,
  MESSAGE_TOO_LONG: 400,
  REASON_REQUIRED: 400,
  CARD_INVALID: 400,
  AUTH_REQUIRED: 401,
  INVALID_CREDENTIALS: 401,
  ROLE_FORBIDDEN: 403,
  ORIGIN_MISMATCH: 403,
  EMAIL_NOT_CONFIRMED: 403,
  STUDENT_NOT_VERIFIED: 403,
  NOT_TASK_OWNER: 403,
  NOT_EXECUTOR: 403,
  NOT_CHAT_PARTICIPANT: 403,
  FILE_FORBIDDEN: 403,
  NOT_FOUND: 404,
  EMAIL_TAKEN: 409,
  EMAIL_ALREADY_CONFIRMED: 409,
  VERIFICATION_PENDING: 409,
  ALREADY_VERIFIED: 409,
  ALREADY_APPLIED: 409,
  TASK_NOT_OPEN: 409,
  TASK_ALREADY_ASSIGNED: 409,
  TASK_HAS_EXECUTOR: 409,
  APPLICATION_NOT_PENDING: 409,
  RESULT_LOCKED: 409,
  NO_RESULT_FILES: 409,
  ALREADY_IN_REVIEW: 409,
  TASK_NOT_IN_REVIEW: 409,
  TASK_ALREADY_DONE: 409,
  CHAT_CLOSED: 409,
  ALREADY_DECIDED: 409,
  DOMAIN_EXISTS: 409,
  INVALID_TRANSITION: 409,
  INSUFFICIENT_FUNDS: 422,
  INSUFFICIENT_BALANCE: 422,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

export const isErrorCode = (value: unknown): value is ErrorCode =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(ERROR_STATUS, value);

/** Error body returned by every failing endpoint (api.md §2). */
export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: Array<{ field: string; code: ErrorCode }>;
  };
}
