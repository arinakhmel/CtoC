import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../../lib/api';
import type { Application } from './apply';

export interface MyApplication extends Application {
  task: { id: string; title: string; priceKopecks: number };
}

export const myApplicationsKey = ['applications', 'mine'] as const;

/** GET /api/me/applications (api.md §4.3a). US-20. Newest first. */
export const useMyApplications = () =>
  useQuery({
    queryKey: myApplicationsKey,
    queryFn: () => apiFetch<{ applications: MyApplication[] }>('/me/applications').then((body) => body.applications),
  });
