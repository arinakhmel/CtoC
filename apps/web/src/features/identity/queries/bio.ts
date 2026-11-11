import { apiFetch } from '../../../lib/api';

/** PUT /api/me/profile (api.md §4.11). Saves the «Про мене» text exactly as typed. */
export const saveBio = (bio: string) => apiFetch<{ bio: string }>('/me/profile', { method: 'PUT', body: JSON.stringify({ bio }) });
