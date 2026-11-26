import { z } from 'zod';
import { LIMITS } from '../limits';

/**
 * US-03 sc.3: `PUT /api/mod/settings` (api.md §4.1e). Only the commission rate is settable in the MVP (OQ-47). It is in basis
 * points (1000 = 10%), an integer in the documented range. Unknown keys are stripped, so a client cannot write any other setting.
 */
export const updateSettingsSchema = z.object({
  commissionBp: z
    .number({ invalid_type_error: 'VALIDATION_FAILED', required_error: 'VALIDATION_FAILED' })
    .int('VALIDATION_FAILED')
    .min(LIMITS.commissionBp.min, 'VALIDATION_FAILED')
    .max(LIMITS.commissionBp.max, 'VALIDATION_FAILED'),
});
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;

/** US-03: a rate in basis points as the visitor reads it, with digits only: 1000 → «10%», 1250 → «12,5%», 5 → «0,05%». */
export function formatCommission(rateBp: number): string {
  const percent = rateBp / 100;
  return `${percent.toLocaleString('uk-UA', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%`;
}

/** US-03: the percent typed in the moderator's form → basis points. Only digits with an optional separator and at most two decimals are a rate; anything else gives NaN. */
export function percentToBp(percent: string): number {
  const text = percent.trim().replace(',', '.');
  return /^\d+(\.\d{1,2})?$/.test(text) ? Math.round(Number(text) * 100) : Number.NaN;
}
