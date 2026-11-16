import { describe, expect, it } from 'vitest';
import { LIMITS, sandboxTopUpSchema } from '../src';
import { codesOf } from './helpers';

describe('US-26 sandbox top-up schema', () => {
  it('US-26 sc.1 a whole number of kopecks inside the limits passes, and the edges pass', () => {
    expect(sandboxTopUpSchema.parse({ amountKopecks: 50_000 })).toEqual({ amountKopecks: 50_000 });
    expect(sandboxTopUpSchema.safeParse({ amountKopecks: LIMITS.sandboxTopUp.min }).success).toBe(true);
    expect(sandboxTopUpSchema.safeParse({ amountKopecks: LIMITS.sandboxTopUp.max }).success).toBe(true);
  });

  it('US-26 a missing, text, fractional, zero, negative, too small or too large amount is VALIDATION_FAILED', () => {
    for (const input of [{}, { amountKopecks: '500' }, { amountKopecks: null }, { amountKopecks: 1.5 }, { amountKopecks: 0 }, { amountKopecks: -100 }, { amountKopecks: LIMITS.sandboxTopUp.min - 1 }, { amountKopecks: LIMITS.sandboxTopUp.max + 1 }, { amountKopecks: Number.NaN }]) {
      expect(codesOf(sandboxTopUpSchema, input)).toContain('VALIDATION_FAILED');
    }
  });

  it('US-26 unknown keys (a forged owner or ledger kind) are stripped', () => {
    expect(sandboxTopUpSchema.parse({ amountKopecks: 10_000, ownerId: 'x', kind: 'payout' })).toEqual({ amountKopecks: 10_000 });
  });
});
