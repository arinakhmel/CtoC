import type { RequestHandler } from 'express';
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
