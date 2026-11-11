import { apiFetch, apiPost } from '../../../lib/api';

export interface SessionUser {
  user: {
    id: string;
    role: 'student' | 'customer' | 'moderator';
    displayName: string;
    emailConfirmed: boolean;
    studentVerified: boolean;
  };
}

/** POST /api/auth/login (api.md §4.7). The API sets the httpOnly `sid` cookie. */
export const login = (email: string, password: string) => apiPost<SessionUser>('/auth/login', { email, password });

/** GET /api/me (api.md §4.7). 401 AUTH_REQUIRED when there is no session. */
export const getMe = () => apiFetch<SessionUser>('/me');
