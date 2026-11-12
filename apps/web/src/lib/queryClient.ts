import { QueryClient } from '@tanstack/react-query';
import { ApiClientError } from './api';

/**
 * One client per mounted app (ADR-0008). A failed API answer (401, 403, 400…) is final and shown at once.
 * Only a lost connection is retried, twice.
 */
export const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failures, error) => error instanceof ApiClientError && error.code === 'NETWORK_ERROR' && failures < 2,
        refetchOnWindowFocus: false,
      },
    },
  });
