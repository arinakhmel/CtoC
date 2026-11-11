import type { VerificationStatus } from '@ctoc/shared';
import { apiFetch } from '../../../lib/api';

export interface Verification {
  id: string;
  status: VerificationStatus;
  label: string;
  reason: string | null;
  createdAt: string;
  decidedAt: string | null;
}

export interface VerificationResponse {
  verification: Verification | null;
}

/** GET /api/me/verification (api.md §4.8). `verification` is null before the first upload. */
export const getMyVerification = () => apiFetch<VerificationResponse>('/me/verification');

/** POST /api/me/verification, multipart field `file` (api.md §4.8). */
export const submitVerification = (file: File) => {
  const body = new FormData();
  body.append('file', file);
  return apiFetch<{ verification: Verification }>('/me/verification', { method: 'POST', body });
};
