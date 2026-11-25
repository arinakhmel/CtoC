import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiClientError, apiPost } from '../../../lib/api';
import { markLoggedIn, markLoggedOut } from '../../../lib/queryClient';
import { getMe } from './login';

export const ME_KEY = ['me'] as const;

/**
 * The current user for the header and the route guard (US-46). `silent`: a 401 here only means "not logged in" and must
 * not send the visitor to /login by itself (see createQueryClient).
 */
export const useMe = () => useQuery({ queryKey: ME_KEY, queryFn: getMe, meta: { silent: true }, retry: false });

/** True when the error is 401 AUTH_REQUIRED: there is no session. */
export const isAnonymous = (error: unknown): boolean => error instanceof ApiClientError && error.code === 'AUTH_REQUIRED';

/** POST /api/auth/logout (api.md §4.7). 204, or 401 when the session was already gone: either way the user is out. */
export const logout = () => apiPost<void>('/auth/logout', {});

/**
 * Logs out, leaves the page, then forgets everything cached for the user and asks `GET /api/me` again (now 401, so the
 * header shows a visitor). The page is left first: the queries of the old page must not be fetched again, because their 401
 * would send the user to /login instead of the landing page. A session that is already gone (401 AUTH_REQUIRED) counts as
 * logged out. Other errors are left to the caller.
 */
export function useLogout(onDone: () => void) {
  const queryClient = useQueryClient();
  const finish = async () => {
    markLoggedOut(queryClient);
    onDone();
    queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== ME_KEY[0] });
    await queryClient.invalidateQueries({ queryKey: ME_KEY });
    // `GET /api/me` has answered (401): the user is a plain visitor now, so the guard and the 401 handler work again, and a
    // protected page opened from here sends them to /login (US-46 checklist).
    markLoggedIn(queryClient);
  };
  return useMutation({
    mutationFn: logout,
    meta: { silent: true },
    onSuccess: finish,
    onError: (error) => {
      if (isAnonymous(error)) finish();
    },
  });
}
