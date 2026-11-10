import type { Request, RequestHandler } from 'express';
import { ApiError } from '../errors';

/** Fixed-window limiter per client IP, in memory (api.md: 429 RATE_LIMITED, NFR-13). */
export function rateLimit(options: { max: number; windowMs: number }): RequestHandler {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (req, _res, next) => {
    const now = Date.now();
    const key = req.ip ?? 'unknown';
    const entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }
    entry.count += 1;
    if (entry.count > options.max) {
      next(new ApiError('RATE_LIMITED'));
      return;
    }
    next();
  };
}

/**
 * Counts only FAILED attempts per client IP (US-45/S3). `check` rejects with RATE_LIMITED once the
 * limit is reached, `fail` records a failure, `reset` forgets the client after a success.
 */
export function failureLimiter(options: { max: number; windowMs: number }) {
  const failures = new Map<string, { count: number; resetAt: number }>();
  const keyOf = (req: Request) => req.ip ?? 'unknown';
  const current = (req: Request) => {
    const entry = failures.get(keyOf(req));
    return entry && entry.resetAt > Date.now() ? entry : undefined;
  };
  return {
    check: ((req, _res, next) => {
      const entry = current(req);
      next(entry && entry.count >= options.max ? new ApiError('RATE_LIMITED') : undefined);
    }) as RequestHandler,
    fail(req: Request): void {
      const entry = current(req);
      if (entry) entry.count += 1;
      else failures.set(keyOf(req), { count: 1, resetAt: Date.now() + options.windowMs });
    },
    reset(req: Request): void {
      failures.delete(keyOf(req));
    },
  };
}
