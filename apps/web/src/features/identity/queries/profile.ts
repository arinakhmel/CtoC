import { apiFetch } from '../../../lib/api';

export interface PublicProfile {
  profile: { id: string; displayName: string; verified: boolean };
}

/** GET /api/profiles/:userId (api.md §4.9). Public. 404 NOT_FOUND for a missing or non-student account. */
export const getProfile = (userId: string) => apiFetch<PublicProfile>(`/profiles/${encodeURIComponent(userId)}`);
