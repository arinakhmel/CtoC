import { VERIFICATION_STATUS_LABELS_UK, type VerificationStatus } from '@ctoc/shared';
import type { VerificationRequest } from '@prisma/client';

/** api.md §4.8. The file itself and the moderator are not exposed to the student. */
export const serializeVerification = (request: VerificationRequest) => ({
  id: request.id,
  status: request.status,
  label: VERIFICATION_STATUS_LABELS_UK[request.status as VerificationStatus],
  reason: request.status === 'rejected' ? request.reason : null,
  createdAt: request.createdAt.toISOString(),
  decidedAt: request.decidedAt?.toISOString() ?? null,
});
