import { useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { isAnonymous, useMe } from '../features/identity/queries/session';
import { isLoggedOut } from '../lib/queryClient';

/**
 * Route guard (ADR-0006, ADR-0008, US-46). A protected page (access other than P in overview.md §4) sends a visitor with no
 * session to /login with the message of AUTH_REQUIRED. Only a 401 from `GET /api/me` counts: another answer, or a lost
 * connection, keeps the page, which then shows its own error. Role checks stay on the server (policies).
 * A user who has just pressed «Вийти» is on the way to the landing page, so the guard does not send them to /login.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const me = useMe();
  const queryClient = useQueryClient();
  if (isAnonymous(me.error) && !isLoggedOut(queryClient)) {
    return <Navigate to="/login" replace state={{ notice: 'AUTH_REQUIRED' }} />;
  }
  return <>{children}</>;
}
