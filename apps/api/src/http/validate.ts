import type { RequestHandler, Response } from 'express';
import { ERROR_STATUS, isErrorCode, type ErrorCode } from '@ctoc/shared';
import type { ZodError, ZodTypeAny } from 'zod';
import { ApiError, type ErrorDetail } from '../errors';

/**
 * Turns a zod error into an ApiError (api.md §2). The shared schemas use error codes as zod
 * messages, so every issue becomes `{ field, code }`. The top-level code is the specific code when
 * all issues agree on one (for example COMMENT_REQUIRED), and VALIDATION_FAILED otherwise.
 */
export function toValidationError(error: ZodError): ApiError {
  const details: ErrorDetail[] = error.issues.map((issue) => ({
    field: issue.path.join('.') || 'body',
    code: isErrorCode(issue.message) && ERROR_STATUS[issue.message] === 400 ? issue.message : 'VALIDATION_FAILED',
  }));
  const codes = new Set<ErrorCode>(details.map((detail) => detail.code));
  const [only] = [...codes];
  const code: ErrorCode = codes.size === 1 && only ? only : 'VALIDATION_FAILED';
  return new ApiError(code, { details });
}

/**
 * Validates `req.query` with a schema from `@ctoc/shared` and leaves the parsed value in `res.locals.query`
 * (Express 5 makes `req.query` read-only). Read it with `parsedQuery<T>(res)`. Put it after the access
 * check in the route, so a forbidden user gets 403 and learns nothing about the parameters.
 */
export function validateQuery(schema: ZodTypeAny): RequestHandler {
  return (req, res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      next(toValidationError(result.error));
      return;
    }
    res.locals.query = result.data;
    next();
  };
}

export const parsedQuery = <T>(res: Response): T => res.locals.query as T;

/**
 * Validates `req.body` with a schema from `@ctoc/shared` and replaces it with the parsed value:
 * unknown keys are stripped (a forged `price` never reaches a service) and values are normalised.
 */
export function validateBody(schema: ZodTypeAny): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) {
      next(toValidationError(result.error));
      return;
    }
    req.body = result.data;
    next();
  };
}
