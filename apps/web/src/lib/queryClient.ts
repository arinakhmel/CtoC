import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { ApiClientError } from './api';

/** Clients whose user has logged out on purpose (US-46/S1) and not logged in again. Their 401 answers do not redirect. */
const loggedOut = new WeakSet<QueryClient>();
export const markLoggedOut = (client: QueryClient): void => void loggedOut.add(client);
export const isLoggedOut = (client: QueryClient): boolean => loggedOut.has(client);
export const markLoggedIn =(client: QueryClient): void => void loggedOut.delete(client);

/**
 * One client per mounted app (ADR-0008). A failed API answer (401, 403, 400…) is final and shown at once.
 * Only a lost connection is retried, twice.
 *
 * `onUnauthorized` (US-46/S3) is called when a query or a mutation fails with 401 AUTH_REQUIRED, which is a session that
 * has expired or ended. A call marked `meta: { silent: true }` is left out: it handles that answer itself (the header
 * asks `GET /api/me` on every page, and an anonymous visitor is not an error).
 */
export const createQueryClient = (onUnauthorized?: (client: QueryClient) => void): QueryClient => {
  const handle = (error: unknown, meta: Record<string, unknown> | undefined) => {
    if (loggedOut.has(client)) return; // the user has just logged out: the 401 of a page being left is expected
    if (error instanceof ApiClientError && error.code === 'AUTH_REQUIRED' && !meta?.silent) onUnauthorized?.(client);
  };
  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({ onError: (error, query) => handle(error, query.meta) }),
    mutationCache: new MutationCache({ onError: (error, _variables, _context, mutation) => handle(error, mutation.meta) }),
    defaultOptions: {
      queries: {
        retry: (failures, error) => error instanceof ApiClientError && error.code === 'NETWORK_ERROR' && failures < 2,
        refetchOnWindowFocus: false,
      },
    },
  });
  return client;
};
