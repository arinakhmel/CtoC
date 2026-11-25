import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../../lib/api';

export interface Settings {
  commissionBp: number;
}

export const publicSettingsKey = ['settings', 'public'] as const;
export const modSettingsKey = ['settings', 'mod'] as const;

/** GET /api/public/settings (api.md §4.1e). US-03 sc.1, sc.3. Fetched again on every visit: the answer is `no-store` and a changed rate must show at once. */
export const usePublicSettings = () =>
  useQuery({
    queryKey: publicSettingsKey,
    queryFn: () => apiFetch<Settings>('/public/settings'),
    staleTime: 0,
    refetchOnMount: 'always',
  });

/** GET /api/mod/settings (api.md §4.1e). The moderator's form starts from the stored rate. */
export const useModSettings = () =>
  useQuery({
    queryKey: modSettingsKey,
    queryFn: () => apiFetch<Settings>('/mod/settings'),
    staleTime: 0,
    refetchOnMount: 'always',
  });

/** PUT /api/mod/settings (api.md §4.1e). US-03 sc.3. The public rate is read again afterwards. */
export const useUpdateSettings = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (settings: Settings) => apiFetch<Settings>('/mod/settings', { method: 'PUT', body: JSON.stringify(settings) }),
    onSuccess: (saved) => {
      client.setQueryData(modSettingsKey, saved);
      return client.invalidateQueries({ queryKey: publicSettingsKey });
    },
  });
};
