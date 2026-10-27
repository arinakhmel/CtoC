import { describe, expect, it } from 'vitest';
import { createApplicationSchema, createTaskSchema, moderationRejectSchema } from '../src';
import { codesOf, fieldsOf } from './helpers';

const inOneWeek = () => new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
const validTask = () => ({
  title: 'Парсер сайту',
  description: 'Потрібен скрипт, що збирає ціни.',
  priceKopecks: 40_000,
  deadlineAt: inOneWeek(),
});

describe('US-16 task form', () => {
  it('US-16 sc.1: a valid form is accepted', () => {
    expect(createTaskSchema.safeParse(validTask()).success).toBe(true);
  });

  it('US-16 sc.2: an empty description is rejected on the description field', () => {
    expect(fieldsOf(createTaskSchema, { ...validTask(), description: '' })).toEqual(['description']);
  });

  it('US-16 sc.3: a one-character title is rejected with TITLE_TOO_SHORT', () => {
    expect(codesOf(createTaskSchema, { ...validTask(), title: 'A' })).toEqual(['TITLE_TOO_SHORT']);
  });

  it('US-16 checklist: a deadline in the past is rejected with DEADLINE_IN_PAST', () => {
    expect(codesOf(createTaskSchema, { ...validTask(), deadlineAt: '2020-01-01T00:00:00Z' })).toEqual(['DEADLINE_IN_PAST']);
  });
});

describe('US-17 task price', () => {
  it('US-17 sc.1: a price of 400 UAH is accepted', () => {
    expect(createTaskSchema.parse({ ...validTask(), priceKopecks: 40_000 }).priceKopecks).toBe(40_000);
  });

  it('US-17 sc.2: 20 UAH is rejected with PRICE_BELOW_MIN', () => {
    expect(codesOf(createTaskSchema, { ...validTask(), priceKopecks: 2_000 })).toEqual(['PRICE_BELOW_MIN']);
  });

  it('US-17 sc.3: a non-numeric price is rejected', () => {
    expect(codesOf(createTaskSchema, { ...validTask(), priceKopecks: 'abc' })).toEqual(['VALIDATION_FAILED']);
  });

  it('US-15 sc.2: a price of 0 is rejected at creation, never reaching moderation', () => {
    expect(codesOf(createTaskSchema, { ...validTask(), priceKopecks: 0 })).toEqual(['PRICE_BELOW_MIN']);
  });

  it('US-17 checklist: a price above the platform maximum is rejected with PRICE_ABOVE_MAX', () => {
    expect(codesOf(createTaskSchema, { ...validTask(), priceKopecks: 5_000_000 })).toEqual(['PRICE_ABOVE_MAX']);
  });
});

describe('US-40 moderation cannot be bypassed through the body', () => {
  it('US-40 sc.3: a status sent by the client is stripped', () => {
    const parsed = createTaskSchema.parse({ ...validTask(), status: 'published' });
    expect(parsed).not.toHaveProperty('status');
  });

  it('US-40 sc.2, US-39 sc.2: a rejection without a reason is rejected with REASON_REQUIRED', () => {
    expect(codesOf(moderationRejectSchema, { reason: '  ' })).toEqual(['REASON_REQUIRED']);
    expect(moderationRejectSchema.parse({ reason: 'Лабораторна робота' }).reason).toBe('Лабораторна робота');
  });
});

describe('US-18, US-19 and US-42 application', () => {
  it('US-19 sc.1: a note is kept', () => {
    const note = 'Маю досвід у подібних лабораторних роботах';
    expect(createApplicationSchema.parse({ note }).note).toBe(note);
  });

  it('US-19 sc.2: a note over 500 characters is rejected with NOTE_TOO_LONG', () => {
    expect(codesOf(createApplicationSchema, { note: 'a'.repeat(501) })).toEqual(['NOTE_TOO_LONG']);
  });

  it('US-19 sc.3: an empty note is allowed and becomes undefined', () => {
    expect(createApplicationSchema.parse({ note: '' }).note).toBeUndefined();
    expect(createApplicationSchema.parse({}).note).toBeUndefined();
  });

  it('US-42 sc.2, US-13 sc.2: a forged price is stripped, the application has no price', () => {
    const parsed = createApplicationSchema.parse({ note: 'hi', priceKopecks: 100, price: 1 });
    expect(parsed).toEqual({ note: 'hi' });
  });
});
