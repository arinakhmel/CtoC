import { apiPost } from '../../../lib/api';

export interface ConfirmedUser {
  user: { id: string; role: 'student' | 'customer'; displayName: string; emailConfirmed: true };
}

/** POST /api/auth/confirm-email (api.md §4.6). */
export const confirmEmail = (token: string) => apiPost<ConfirmedUser>('/auth/confirm-email', { token });

/** POST /api/auth/resend-confirmation (api.md §4.6). Answers 202 with no body. */
export const resendConfirmation = (email: string) => apiPost<void>('/auth/resend-confirmation', { email });
