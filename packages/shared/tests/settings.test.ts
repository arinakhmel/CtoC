import { describe, expect, it } from 'vitest';
import { formatCommission, LIMITS, percentToBp, updateSettingsSchema } from '../src';
import { codesOf } from './helpers';

describe('US-03 the commission setting (updateSettingsSchema)', () => {
  it('US-03 sc.3 an integer rate inside the range is accepted, including both ends', () => {
    for (const commissionBp of [LIMITS.commissionBp.min, 1500, LIMITS.commissionBp.max]) {
      expect(updateSettingsSchema.parse({ commissionBp })).toEqual({ commissionBp });
    }
  });

  it('US-03 sc.3 a rate outside the range, a fraction, a text or nothing is VALIDATION_FAILED', () => {
    for (const input of [{ commissionBp: -1 }, { commissionBp: 5001 }, { commissionBp: 10.5 }, { commissionBp: '1000' }, { commissionBp: null }, {}]) {
      expect(codesOf(updateSettingsSchema, input)).toEqual(['VALIDATION_FAILED']);
    }
  });

  it('US-03 sc.3 any other key is dropped, so a client cannot set another setting', () => {
    expect(updateSettingsSchema.parse({ commissionBp: 1000, min_price_kopecks: 1, maxPriceKopecks: 2 })).toEqual({ commissionBp: 1000 });
  });
});

describe('US-03 the commission as text', () => {
  it('US-03 sc.1 shows the rate in percent, with digits only', () => {
    expect(formatCommission(1000)).toBe('10%');
    expect(formatCommission(1250)).toBe('12,5%');
    expect(formatCommission(5)).toBe('0,05%');
    expect(formatCommission(0)).toBe('0%');
  });

  it('US-03 sc.3 the percent of the form becomes basis points; text, a third decimal and a minus are not a rate', () => {
    expect(percentToBp('10')).toBe(1000);
    expect(percentToBp(' 12,5 ')).toBe(1250);
    expect(percentToBp('0.05')).toBe(5);
    for (const text of ['', 'abc', '1e1', '-1', '10.123', '10%']) expect(percentToBp(text)).toBeNaN();
  });
});
