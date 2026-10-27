import { z } from 'zod';

export const normalizeEmail = (value: string): string => value.trim().toLowerCase();

export const emailDomain = (email: string): string => normalizeEmail(email).split('@')[1] ?? '';

/**
 * First filter for student sign-up. The authoritative check is the admin-editable allow-list
 * of university domains in the database (digest A-17), applied by the identity service.
 */
export const UNIVERSITY_DOMAIN_SUFFIXES: readonly string[] = ['.edu.ua'];

export function isUniversityEmail(
  email: string,
  suffixes: readonly string[] = UNIVERSITY_DOMAIN_SUFFIXES,
): boolean {
  const domain = emailDomain(email);
  return suffixes.some((suffix) => domain.endsWith(suffix) && domain.length > suffix.length);
}

/** Trimmed, lower-cased, valid email. */
export const emailSchema = z.string().trim().toLowerCase().email({ message: 'VALIDATION_FAILED' });

/** Student sign-up email: normalised and on a university domain (US-06/S1, S2). */
export const studentEmailSchema = emailSchema.refine((value) => isUniversityEmail(value), {
  message: 'EMAIL_DOMAIN_NOT_ALLOWED',
});
