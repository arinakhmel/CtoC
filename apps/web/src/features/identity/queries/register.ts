import type { RegisterInput } from '@ctoc/shared';
import { apiPost } from '../../../lib/api';

export interface RegisteredUser {
  user: { id: string; role: 'student' | 'customer'; displayName: string; emailConfirmed: boolean };
}

/** POST /api/auth/register (api.md §4.5). */
export const registerAccount = (input: RegisterInput) => apiPost<RegisteredUser>('/auth/register', input);
