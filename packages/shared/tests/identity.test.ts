import { describe, expect, it } from 'vitest';
import {
  checkDocumentUpload,
  confirmEmailSchema,
  isUniversityEmail,
  loginSchema,
  registerSchema,
  resendConfirmationSchema,
  VERIFICATION_STATUS_LABELS_UK,
} from '../src';
import { codesOf, fieldsOf } from './helpers';

describe('US-06 registration with a university email', () => {
  it('US-06 sc.1: a university email is accepted and normalised to lower case', () => {
    const parsed = registerSchema.parse({
      role: 'student',
      email: '  User@University.EDU.UA ',
      displayName: 'Олена Коваль',
      password: 'secret-pass',
    });
    expect(parsed.email).toBe('user@university.edu.ua');
  });

  it('US-06 sc.2: a public mail domain is rejected with EMAIL_DOMAIN_NOT_ALLOWED', () => {
    const input = { role: 'student', email: 'test@gmail.com', displayName: 'Test User', password: 'secret-pass' };
    expect(codesOf(registerSchema, input)).toEqual(['EMAIL_DOMAIN_NOT_ALLOWED']);
    expect(fieldsOf(registerSchema, input)).toEqual(['email']);
  });

  it('US-06 sc.2: the bare suffix without a university name is not a university domain', () => {
    expect(isUniversityEmail('a@edu.ua')).toBe(false);
    expect(isUniversityEmail('a@knu.edu.ua')).toBe(true);
  });
});

describe('US-43 registration of a customer', () => {
  it('US-43 sc.1: a customer may use any email domain', () => {
    const parsed = registerSchema.parse({
      role: 'customer',
      email: 'Owner@Company.com',
      displayName: 'ФОП Іваненко',
      password: 'secret-pass',
    });
    expect(parsed.email).toBe('owner@company.com');
  });

  it('US-43 sc.1: an unknown account type is rejected', () => {
    expect(codesOf(registerSchema, { role: 'moderator', email: 'a@b.com', displayName: 'Ab', password: 'secret-pass' })).toEqual([
      'VALIDATION_FAILED',
    ]);
  });
});

describe('US-44 display name', () => {
  const base = { role: 'customer', email: 'owner@company.com', password: 'secret-pass' } as const;

  it('US-44 sc.1: a Cyrillic name of 2 to 60 characters is accepted', () => {
    expect(registerSchema.safeParse({ ...base, displayName: 'Олена Коваль' }).success).toBe(true);
  });

  it('US-44 sc.2: a name of one character is rejected', () => {
    expect(fieldsOf(registerSchema, { ...base, displayName: 'О' })).toEqual(['displayName']);
  });

  it('US-44 checklist: a name over 60 characters is rejected', () => {
    expect(fieldsOf(registerSchema, { ...base, displayName: 'о'.repeat(61) })).toEqual(['displayName']);
  });
});

describe('US-45 login', () => {
  it('US-45 sc.1: email and password are required, the email is normalised', () => {
    expect(loginSchema.parse({ email: ' A@B.com ', password: 'x' }).email).toBe('a@b.com');
    expect(fieldsOf(loginSchema, { email: 'a@b.com', password: '' })).toEqual(['password']);
  });
});

describe('US-07 confirmation schemas', () => {
  it('US-07 sc.1: a non-empty token is accepted and trimmed', () => {
    expect(confirmEmailSchema.parse({ token: ' abc ' }).token).toBe('abc');
  });

  it('US-07 sc.1: a missing or empty token is TOKEN_INVALID', () => {
    expect(codesOf(confirmEmailSchema, {})).toEqual(['TOKEN_INVALID']);
    expect(codesOf(confirmEmailSchema, { token: '  ' })).toEqual(['TOKEN_INVALID']);
  });

  it('US-07 sc.3: resend takes a normalised email and rejects a malformed one', () => {
    expect(resendConfirmationSchema.parse({ email: ' User@University.EDU.UA ' }).email).toBe('user@university.edu.ua');
    expect(codesOf(resendConfirmationSchema, { email: 'nope' })).toEqual(['VALIDATION_FAILED']);
  });
});

describe('US-08 verification labels and upload rules', () => {
  it('US-08 sc.1: the pending request is labelled «Очікує перевірки» (decision W-14)', () => {
    expect(VERIFICATION_STATUS_LABELS_UK.pending).toBe('Очікує перевірки');
  });

  it('US-08 sc.2: only JPEG, PNG and PDF documents are allowed', () => {
    const base = { sizeBytes: 100, fileName: 'f' };
    for (const mime of ['image/jpeg', 'image/png', 'application/pdf']) {
      expect(checkDocumentUpload({ ...base, mime })).toBeNull();
    }
    expect(checkDocumentUpload({ ...base, mime: 'application/zip' })).toBe('FILE_TYPE_NOT_ALLOWED');
    expect(checkDocumentUpload({ ...base, mime: 'application/x-msdownload' })).toBe('FILE_TYPE_NOT_ALLOWED');
  });

  it('US-08 sc.3: 10 MB is the last accepted size', () => {
    const base = { mime: 'application/pdf', fileName: 'f.pdf' };
    expect(checkDocumentUpload({ ...base, sizeBytes: 10 * 1024 * 1024 })).toBeNull();
    expect(checkDocumentUpload({ ...base, sizeBytes: 10 * 1024 * 1024 + 1 })).toBe('FILE_TOO_LARGE');
  });
});
