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

export interface ModVerificationRow {
  id: string;
  status: string;
  reason: string | null;
  createdAt: Date;
  decidedAt: Date | null;
  user: { id: string; displayName: string; email: string };
  file: { id: string; originalName: string; mime: string; sizeBytes: number };
}

/** api.md §4.8b. For the moderator: the student's email and the file to open. The moderator's own id is not exposed. */
export const serializeModVerification = (row: ModVerificationRow) => ({
  id: row.id,
  student: { id: row.user.id, displayName: row.user.displayName, email: row.user.email },
  file: { id: row.file.id, originalName: row.file.originalName, mime: row.file.mime, sizeBytes: row.file.sizeBytes },
  status: row.status,
  reason: row.reason,
  createdAt: row.createdAt.toISOString(),
  decidedAt: row.decidedAt?.toISOString() ?? null,
});
