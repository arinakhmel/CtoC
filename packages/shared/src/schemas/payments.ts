import { z } from 'zod';
import { LIMITS } from '../limits';

const luhnValid = (digits: string): boolean => {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let d = Number(digits[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
};

/**
 * US-36/S2: 16 digits and a valid Luhn checksum. Spaces are ignored. Whether the issuer is a
 * Ukrainian bank cannot be checked without BIN data (overview.md OQ-13).
 */
export const cardNumberSchema = z
  .string({ required_error: 'CARD_INVALID', invalid_type_error: 'CARD_INVALID' })
  .transform((value) => value.replace(/\s+/g, ''))
  .refine((digits) => new RegExp(`^\\d{${LIMITS.cardNumberLength}}$`).test(digits) && luhnValid(digits), {
    message: 'CARD_INVALID',
  });

export const createWithdrawalSchema = z.object({
  amountKopecks: z
    .number({ required_error: 'VALIDATION_FAILED', invalid_type_error: 'VALIDATION_FAILED' })
    .int('VALIDATION_FAILED')
    .positive('VALIDATION_FAILED'),
  cardNumber: cardNumberSchema,
});
