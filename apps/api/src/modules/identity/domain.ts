import { createHash, randomBytes } from 'node:crypto';

/** Confirmation token lifetime: 24 hours (domain-model.md, US-07/CL). */
export const CONFIRM_TOKEN_TTL_MS = 24 * 3600 * 1000;

/** At least 32 random bytes (domain-model.md). Only the hash is stored. */
export const generateToken = (): string => randomBytes(32).toString('base64url');
export const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

/** Why a token could not be consumed: past its lifetime and never used is "expired", anything else is "invalid". */
export const tokenFailure = (token: { usedAt: Date | null; expiresAt: Date }, now: Date): 'TOKEN_EXPIRED' | 'TOKEN_INVALID' =>
  token.usedAt === null && token.expiresAt <= now ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID';

/** Login session lifetime: 7 days, fixed (decided with the product owner for US-45). */
export const SESSION_TTL_MS = 7 * 24 * 3600 * 1000;

/** The cookie value. Only its hash is stored in `sessions.id`, so a leaked database cannot be replayed. */
export const generateSessionId = (): string => randomBytes(32).toString('base64url');
export const hashSessionId = hashToken;

/** INV-03: the badge is derived from studentVerifiedAt and from nothing else. */
export const isVerifiedStudent = (user: { studentVerifiedAt: Date | null }): boolean => user.studentVerifiedAt !== null;
