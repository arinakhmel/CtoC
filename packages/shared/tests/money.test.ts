import { describe, expect, it } from 'vitest';
import { commissionOf, createTaskSchema, splitPrice } from '../src';
import { codesOf } from './helpers';

const inOneWeek = () => new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
const taskWithPrice = (priceKopecks: number) => ({
  title: 'Парсер сайту',
  description: 'Потрібен скрипт, що збирає ціни.',
  priceKopecks,
  deadlineAt: inOneWeek(),
});

describe('US-15 net amount', () => {
  it('US-15 sc.1: 1000 UAH at 10% gives a net of 900 UAH', () => {
    expect(splitPrice(100_000, 1000)).toEqual({ grossKopecks: 100_000, commissionKopecks: 10_000, netKopecks: 90_000 });
  });

  it('US-15 sc.1 / INV-08: gross = commission + net for odd kopecks, rounded half-up', () => {
    // 10.05 UAH at 10% = 100.5 kopecks, which rounds up to 101
    expect(splitPrice(1005, 1000)).toEqual({ grossKopecks: 1005, commissionKopecks: 101, netKopecks: 904 });
    for (const price of [5_001, 12_345, 99_999, 1_999_999]) {
      for (const bp of [0, 1, 999, 1000, 3333, 5000]) {
        const { grossKopecks, commissionKopecks, netKopecks } = splitPrice(price, bp);
        expect(commissionKopecks + netKopecks).toBe(grossKopecks);
      }
    }
  });

  // W-04, decided: the price is rejected at creation, so the calculation never runs for it.
  it.each([0, -1, -50_000])('US-15 sc.2: no calculation for a price of %s', (price) => {
    expect(() => commissionOf(price, 1000)).toThrow(RangeError);
    expect(() => splitPrice(price, 1000)).toThrow(RangeError);
  });

  it.each([0, -1, -50_000])('US-15 sc.2 (W-04): the task form rejects a price of %s with PRICE_BELOW_MIN', (price) => {
    expect(codesOf(createTaskSchema, taskWithPrice(price))).toContain('PRICE_BELOW_MIN');
  });
});
