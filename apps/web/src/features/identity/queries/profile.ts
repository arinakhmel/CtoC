import { apiFetch } from '../../../lib/api';
import type { ExperienceRecord } from '../../experience/components/ExperienceList';

export interface PublicProfile {
  profile: { id: string; displayName: string; verified: boolean; skills: string[]; bio: string; experience: ExperienceRecord[] };
}

/** GET /api/profiles/:userId (api.md §4.9). Public. 404 NOT_FOUND for a missing or non-student account. */
export const getProfile = (userId: string) => apiFetch<PublicProfile>(`/profiles/${encodeURIComponent(userId)}`);
