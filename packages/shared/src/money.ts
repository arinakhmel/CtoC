// Money is always an integer number of kopecks (ADR-0007). No floats.

/** Commission in kopecks, rounded half-up. `rateBp` is basis points (1000 = 10%). */
export function commissionOf(priceKopecks: number, rateBp: number): number {
  if (!Number.isInteger(priceKopecks) || priceKopecks <= 0) {
    throw new RangeError('priceKopecks must be a positive integer');
  }
  return Math.floor((priceKopecks * rateBp + 5_000) / 10_000);
}

/** gross = commission + net, always exactly (US-15/S1, US-35/S2). */
export function splitPrice(priceKopecks: number, rateBp: number) {
  const commissionKopecks = commissionOf(priceKopecks, rateBp);
  return { grossKopecks: priceKopecks, commissionKopecks, netKopecks: priceKopecks - commissionKopecks };
}
