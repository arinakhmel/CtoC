import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ApiError } from '../errors';

/** Any request that no route handled: 404 in the documented error format. */
export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(new ApiError('NOT_FOUND'));
};

interface BodyParserError {
  type?: string;
  status?: number;
}

const isBodyParserError = (err: unknown): err is BodyParserError =>
  typeof err === 'object' && err !== null && typeof (err as BodyParserError).type === 'string' && 'status' in err;

/**
 * Central error handler (ADR-0005). Services throw ApiError and routes never build error responses.
 * Unexpected errors become 500 INTERNAL_ERROR without leaking details (US-21/S2, US-30/S2).
 */
export const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }
  if (err instanceof ApiError) {
    res.status(err.status).json(err.toBody());
    return;
  }
  // Malformed (400) or oversized (413) JSON from express.json()
  if (isBodyParserError(err) && (err.status === 400 || err.status === 413)) {
    const apiError = new ApiError('VALIDATION_FAILED');
    res.status(apiError.status).json(apiError.toBody());
    return;
  }
  console.error('Unhandled error', err);
  const apiError = new ApiError('INTERNAL_ERROR');
  res.status(apiError.status).json(apiError.toBody());
};
