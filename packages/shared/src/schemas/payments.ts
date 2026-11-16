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

/**
 * US-26 (OQ-09, A-06): the sandbox top-up of a customer's balance. An integer number of kopecks (ADR-0007), from 1 UAH to the
 * highest price of a task (one top-up can pay for any task). Unknown keys are stripped: the owner is the session, the kind of
 * ledger entry is fixed by the server.
 */
export const sandboxTopUpSchema = z.object({
  amountKopecks: z
    .number({ required_error: 'VALIDATION_FAILED', invalid_type_error: 'VALIDATION_FAILED' })
    .int('VALIDATION_FAILED')
    .min(LIMITS.sandboxTopUp.min, 'VALIDATION_FAILED')
    .max(LIMITS.sandboxTopUp.max, 'VALIDATION_FAILED'),
});
export type SandboxTopUpInput = z.infer<typeof sandboxTopUpSchema>;
