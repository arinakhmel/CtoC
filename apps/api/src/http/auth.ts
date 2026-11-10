import type { User } from '@prisma/client';
import type { RequestHandler } from 'express';
import { ApiError } from '../errors';
import { hashSessionId } from '../modules/identity/domain';
import { findValidSession } from '../modules/identity/repo';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by `sessionMiddleware` when the `sid` cookie belongs to an unexpired session. */
      user?: User;
    }
  }
}

export const SESSION_COOKIE = 'sid';

function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index > 0 && part.slice(0, index).trim() === name) {
      try {
        return decodeURIComponent(part.slice(index + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

/** Reads the `sid` cookie and loads the user of a valid session (ADR-0006). No cookie or a bad one: no user. */
export const sessionMiddleware: RequestHandler = async (req, _res, next) => {
  const sid = readCookie(req.headers.cookie, SESSION_COOKIE);
  if (sid) {
    const session = await findValidSession(hashSessionId(sid), new Date());
    if (session) req.user = session.user;
  }
  next();
};

/** 401 AUTH_REQUIRED unless the request has a valid session. Policies run after it. */
export const requireUser: RequestHandler = (req, _res, next) => {
  next(req.user ? undefined : new ApiError('AUTH_REQUIRED'));
};

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF check (api.md Conventions, ADR-0006). A state-changing request that carries the session cookie must
 * send an `Origin` header equal to the web app origin. Requests without the cookie cannot act as a user,
 * so the public endpoints are not affected.
 */
export const originCheck: RequestHandler = (req, _res, next) => {
  if (SAFE_METHODS.has(req.method) || !readCookie(req.headers.cookie, SESSION_COOKIE)) {
    next();
    return;
  }
  const expected = new URL(process.env.APP_URL ?? 'http://localhost:5173').origin;
  next(req.headers.origin === expected ? undefined : new ApiError('ORIGIN_MISMATCH'));
};
