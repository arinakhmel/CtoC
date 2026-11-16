import type { TaskStatus } from '@ctoc/shared';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../../lib/api';
import type { Application } from './apply';

export interface Candidate extends Application {
  student: { id: string; displayName: string; verified: boolean; skills: string[]; bio: string };
}

export interface CandidatesResponse {
  task: { id: string; title: string; status: TaskStatus; priceKopecks: number };
  applications: Candidate[];
  /** True when the task has more applicants than the list holds (api.md §4.3d). */
  truncated?: boolean;
}

export const candidatesKey = (taskId: string) => ['applications', 'task', taskId] as const;

/** GET /api/tasks/:id/applications (api.md §4.3d). US-24. The owner's list of applicants, oldest first. */
export const useCandidates = (taskId: string) =>
  useQuery({
    queryKey: candidatesKey(taskId),
    queryFn: () => apiFetch<CandidatesResponse>(`/tasks/${encodeURIComponent(taskId)}/applications`),
  });
