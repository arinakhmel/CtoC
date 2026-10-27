import { useEffect, useState } from 'react';
import { apiFetch } from './api';

export type ApiHealth = 'checking' | 'ok' | 'unavailable';

/** Calls GET /api/health once. Used by the layout so every page shows whether the API is up. */
export function useApiHealth(): ApiHealth {
  const [health, setHealth] = useState<ApiHealth>('checking');

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ status: string }>('/health')
      .then((body) => !cancelled && setHealth(body.status === 'ok' ? 'ok' : 'unavailable'))
      .catch(() => !cancelled && setHealth('unavailable'));
    return () => {
      cancelled = true;
    };
  }, []);

  return health;
}
