import { createHash, randomBytes } from 'node:crypto';

/** Confirmation token lifetime: 24 hours (domain-model.md, US-07/CL). */
export const CONFIRM_TOKEN_TTL_MS = 24 * 3600 * 1000;

/** At least 32 random bytes (domain-model.md). Only the hash is stored. */
export const generateToken = (): string => randomBytes(32).toString('base64url');
export const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');
