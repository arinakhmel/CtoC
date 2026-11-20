import { z } from 'zod';

export const MOD_VERIFICATION_STATUSES = ['pending', 'approved', 'rejected'] as const;

/** US-39: `GET /api/mod/verifications?status=` (api.md §4.8b). The queue of pending documents by default. */
export const modVerificationsQuerySchema = z.object({
  status: z.enum(MOD_VERIFICATION_STATUSES, { errorMap: () => ({ message: 'VALIDATION_FAILED' }) }).default('pending'),
});
export type ModVerificationsQuery = z.infer<typeof modVerificationsQuerySchema>;
