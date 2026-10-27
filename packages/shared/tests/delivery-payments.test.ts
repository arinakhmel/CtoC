import { describe, expect, it } from 'vitest';
import {
  cardNumberSchema,
  checkDocumentUpload,
  checkResultUpload,
  commissionOf,
  createWithdrawalSchema,
  returnForRevisionSchema,
  sendMessageSchema,
  splitPrice,
} from '../src';
import { codesOf } from './helpers';

const MB = 1024 * 1024;

describe('US-33 revision comment', () => {
  it('US-33 sc.1: a comment is accepted and trimmed', () => {
    expect(returnForRevisionSchema.parse({ comment: '  Виправте шапку  ' }).comment).toBe('Виправте шапку');
  });

  it('US-32 sc.3, US-33 sc.2: an empty comment is rejected with COMMENT_REQUIRED', () => {
    expect(codesOf(returnForRevisionSchema, { comment: '' })).toEqual(['COMMENT_REQUIRED']);
    expect(codesOf(returnForRevisionSchema, {})).toEqual(['COMMENT_REQUIRED']);
  });

  it('US-33 sc.3: a comment over 2000 characters is rejected with COMMENT_TOO_LONG', () => {
    expect(codesOf(returnForRevisionSchema, { comment: 'a'.repeat(2001) })).toEqual(['COMMENT_TOO_LONG']);
  });
});

describe('US-23 chat message', () => {
  it('US-23 sc.2: an empty message is rejected with MESSAGE_EMPTY', () => {
    expect(codesOf(sendMessageSchema, { body: '   ' })).toEqual(['MESSAGE_EMPTY']);
  });

  it('US-23 sc.1: a normal message is accepted', () => {
    expect(sendMessageSchema.parse({ body: 'Привіт!' }).body).toBe('Привіт!');
  });
});

describe('US-08 and US-27 uploads', () => {
  it('US-08 sc.1: JPG, PNG and PDF of 10 MB are accepted', () => {
    for (const mime of ['image/jpeg', 'image/png', 'application/pdf']) {
      expect(checkDocumentUpload({ mime, sizeBytes: 10 * MB, fileName: 'card' })).toBeNull();
    }
  });

  it('US-08 sc.2: an .exe or .zip document is rejected with FILE_TYPE_NOT_ALLOWED', () => {
    expect(checkDocumentUpload({ mime: 'application/x-msdownload', sizeBytes: 1, fileName: 'a.exe' })).toBe('FILE_TYPE_NOT_ALLOWED');
    expect(checkDocumentUpload({ mime: 'application/zip', sizeBytes: 1, fileName: 'a.zip' })).toBe('FILE_TYPE_NOT_ALLOWED');
  });

  it('US-08 sc.3: a document over 10 MB is rejected with FILE_TOO_LARGE', () => {
    expect(checkDocumentUpload({ mime: 'application/pdf', sizeBytes: 10 * MB + 1, fileName: 'a.pdf' })).toBe('FILE_TOO_LARGE');
  });

  it('US-27 sc.2: a .bat or .scr result is rejected, whatever its case', () => {
    expect(checkResultUpload({ mime: 'text/plain', sizeBytes: 1, fileName: 'run.BAT' })).toBe('FILE_TYPE_NOT_ALLOWED');
    expect(checkResultUpload({ mime: 'text/plain', sizeBytes: 1, fileName: 'saver.scr' })).toBe('FILE_TYPE_NOT_ALLOWED');
  });

  it('US-27 sc.3: a result over 50 MB is rejected with FILE_TOO_LARGE', () => {
    expect(checkResultUpload({ mime: 'application/zip', sizeBytes: 50 * MB + 1, fileName: 'r.zip' })).toBe('FILE_TOO_LARGE');
  });

  it('US-27 sc.1: a zip result within the limit is accepted (overview.md OQ-18)', () => {
    expect(checkResultUpload({ mime: 'application/zip', sizeBytes: 5 * MB, fileName: 'project.zip' })).toBeNull();
  });
});

describe('US-15 and US-35 commission arithmetic', () => {
  it('US-15 sc.1: 1000 UAH at 10% shows 900 UAH net', () => {
    expect(splitPrice(100_000, 1_000)).toEqual({ grossKopecks: 100_000, commissionKopecks: 10_000, netKopecks: 90_000 });
  });

  it('US-15 sc.2: a price of 0 or less is not calculated', () => {
    expect(() => splitPrice(0, 1_000)).toThrow(RangeError);
    expect(() => splitPrice(-5, 1_000)).toThrow(RangeError);
  });

  it('US-35 sc.2: odd kopecks round half-up', () => {
    expect(commissionOf(5_005, 1_000)).toBe(501); // 500.5 -> 501
    expect(commissionOf(5_004, 1_000)).toBe(500); // 500.4 -> 500
  });

  it('US-35 sc.2: gross always equals commission plus net, for every price and rate', () => {
    for (let price = 5_000; price <= 20_000; price += 7) {
      for (const bp of [0, 333, 1_000, 1_250, 5_000]) {
        const { grossKopecks, commissionKopecks, netKopecks } = splitPrice(price, bp);
        expect(commissionKopecks + netKopecks).toBe(grossKopecks);
        expect(Number.isInteger(commissionKopecks)).toBe(true);
      }
    }
  });
});

describe('US-36 withdrawal', () => {
  it('US-36 sc.1: a 16-digit card with a valid checksum is accepted, spaces are ignored', () => {
    expect(cardNumberSchema.parse('4111 1111 1111 1111')).toBe('4111111111111111');
  });

  it('US-36 sc.2: a wrong digit count or checksum is rejected with CARD_INVALID', () => {
    expect(codesOf(cardNumberSchema, '4111 1111 1111')).toEqual(['CARD_INVALID']);
    expect(codesOf(cardNumberSchema, '4111 1111 1111 1112')).toEqual(['CARD_INVALID']);
    expect(codesOf(cardNumberSchema, '4111-1111-1111-1111')).toEqual(['CARD_INVALID']);
  });

  it('US-36 sc.3: the amount must be a positive integer (the balance check is in the API)', () => {
    expect(createWithdrawalSchema.safeParse({ amountKopecks: 50_000, cardNumber: '4111111111111111' }).success).toBe(true);
    expect(codesOf(createWithdrawalSchema, { amountKopecks: 0, cardNumber: '4111111111111111' })).toEqual(['VALIDATION_FAILED']);
  });
});
