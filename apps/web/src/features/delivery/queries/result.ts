import type { TaskStatus } from '@ctoc/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiClientError, apiFetch, apiPost } from '../../../lib/api';
import { taskKey, type TaskDetails } from '../../tasks/queries/task';
import { myWorkKey } from '../../tasks/queries/work';

export interface ResultFile {
  id: string;
  name: string;
  mime: string;
  sizeBytes: number;
  createdAt: string;
}

export interface Result {
  version: number;
  status: 'draft' | 'submitted' | 'accepted' | 'returned';
  revisionComment: string | null;
  submittedAt: string | null;
  files: ResultFile[];
}

export const resultKey = (taskId: string) => ['result', taskId] as const;

/** GET /api/tasks/:id/result (api.md §4.14). `null` before the first upload. */
export const useResult = (taskId: string) =>
  useQuery({
    queryKey: resultKey(taskId),
    queryFn: () => apiFetch<{ result: Result | null }>(`/tasks/${encodeURIComponent(taskId)}/result`).then((body) => body.result),
  });

/** POST /api/tasks/:id/result/files, multipart field `file` (api.md §4.14). The answer is the whole current result. */
export const useUploadResultFile = (taskId: string) => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const body = new FormData();
      body.append('file', file);
      return apiFetch<{ result: Result }>(`/tasks/${encodeURIComponent(taskId)}/result/files`, { method: 'POST', body }).then((answer) => answer.result);
    },
    onSuccess: (result) => client.setQueryData(resultKey(taskId), result),
  });
};

/**
 * POST /api/tasks/:id/result/submit (api.md §4.14, US-28). The answer carries the task in `in_review` and the submitted result.
 * On success the cached task is set to `in_review` at once (so the upload form goes away without waiting) and the task and
 * «Мої активні завдання» are fetched again. A 409 ALREADY_IN_REVIEW or INVALID_TRANSITION means the task was already moved on
 * (another tab, a double click): the task is fetched again so the page shows the status it really has.
 */
export const useSubmitResult = (taskId: string) => {
  const client = useQueryClient();
  const refresh = () => {
    void client.invalidateQueries({ queryKey: taskKey(taskId) });
    void client.invalidateQueries({ queryKey: resultKey(taskId) });
    void client.invalidateQueries({ queryKey: myWorkKey });
  };
  return useMutation({
    mutationFn: () =>
      apiPost<{ task: { id: string; status: string }; result: Result }>(`/tasks/${encodeURIComponent(taskId)}/result/submit`, {}),
    onSuccess: (answer) => {
      client.setQueryData(resultKey(taskId), answer.result);
      client.setQueryData(taskKey(taskId), (previous: TaskDetails | undefined) =>
        previous ? { ...previous, status: answer.task.status as TaskStatus } : previous,
      );
      refresh();
    },
    onError: (error) => {
      if (error instanceof ApiClientError && (error.code === 'ALREADY_IN_REVIEW' || error.code === 'INVALID_TRANSITION')) refresh();
    },
  });
};
