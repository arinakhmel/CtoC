import { ERROR_STATUS, MESSAGES_UK, type ApiErrorBody, type ErrorCode } from '@ctoc/shared';

export interface ErrorDetail {
  field: string;
  code: ErrorCode;
}

/**
 * The only way to fail a request on purpose (api.md §2). The HTTP status comes from the code
 * (ERROR_STATUS), the default message is the Ukrainian text from the dictionary.
 *
 *   throw new ApiError('TASK_ALREADY_ASSIGNED');
 */
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: ErrorDetail[];

  constructor(code: ErrorCode, options: { message?: string; details?: ErrorDetail[] } = {}) {
    super(options.message ?? MESSAGES_UK[code]);
    this.name = 'ApiError';
    this.code = code;
    this.status = ERROR_STATUS[code];
    if (options.details) this.details = options.details;
  }

  toBody(): ApiErrorBody {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details ? { details: this.details } : {}),
      },
    };
  }
}
