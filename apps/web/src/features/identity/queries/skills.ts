import { apiFetch } from '../../../lib/api';
import { getMe } from './login';
import { getProfile } from './profile';

/** The student's own id and skills: GET /api/me, then the public profile (api.md §4.9). No extra endpoint. */
export async function getMySkills(): Promise<{ userId: string; skills: string[] }> {
  const { user } = await getMe();
  const { profile } = await getProfile(user.id);
  return { userId: user.id, skills: profile.skills };
}

/** PUT /api/me/skills (api.md §4.10). Replaces the whole set. */
export const saveSkills = (skills: string[]) =>
  apiFetch<{ skills: string[] }>('/me/skills', { method: 'PUT', body: JSON.stringify({ skills }) });

/** GET /api/skills?query= (api.md §4.10): catalogue suggestions. */
export const suggestSkills = (query = '') => apiFetch<{ skills: string[] }>(`/skills?query=${encodeURIComponent(query)}`);
