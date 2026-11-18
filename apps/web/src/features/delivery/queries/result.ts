import type { TaskStatus } from '@ctoc/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiClientError, apiFetch, apiPost } from '../../../lib/api';
import { candidatesKey } from '../../applications/queries/candidates';
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
  /** The latest comment of the customer, given only while the task is in revision (US-33): it stays after a new draft was started. */
  lastReturn?: { version: number; comment: string; returnedAt: string | null } | null;
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

/**
 * DELETE /api/tasks/:id/result/files/:fileId (api.md §4.14, US-29). 204 without a body. On success the file leaves the cached
 * list at once. A 409 RESULT_LOCKED or INVALID_TRANSITION means the task was moved on (sent for review in another tab): the
 * task, the result and «Мої активні завдання» are fetched again, so the page shows what is really allowed. A 404 means the
 * file is already gone (a second click, another tab): the result is fetched again and the list is right.
 */
export const useDeleteResultFile = (taskId: string) => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (fileId: string) =>
      apiFetch<void>(`/tasks/${encodeURIComponent(taskId)}/result/files/${encodeURIComponent(fileId)}`, { method: 'DELETE' }),
    onSuccess: (_answer, fileId) =>
      client.setQueryData(resultKey(taskId), (previous: Result | null | undefined) =>
        previous ? { ...previous, files: previous.files.filter((file) => file.id !== fileId) } : previous,
      ),
    onError: (error) => {
      if (!(error instanceof ApiClientError)) return;
      if (error.code === 'RESULT_LOCKED' || error.code === 'INVALID_TRANSITION') {
        void client.invalidateQueries({ queryKey: taskKey(taskId) });
        void client.invalidateQueries({ queryKey: myWorkKey });
      }
      if (error.code === 'RESULT_LOCKED' || error.code === 'INVALID_TRANSITION' || error.code === 'NOT_FOUND') {
        void client.invalidateQueries({ queryKey: resultKey(taskId) });
      }
    },
  });
};

export interface AcceptResponse {
  task: { id: string; status: 'done'; completedAt: string };
  payout: { grossKopecks: number; commissionKopecks: number; netKopecks: number };
  experienceRecordId: string;
}

/**
 * POST /api/tasks/:id/accept (api.md §4.2, US-31). The customer accepts the result. Whatever the answer, the customer's task (the
 * candidate list answer carries its status) and the result are fetched again, so the page shows the real state: after a 409
 * TASK_ALREADY_DONE or TASK_NOT_IN_REVIEW it shows what another tab or a double click already did.
 */
export const useAcceptResult = (taskId: string) => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost<AcceptResponse>(`/tasks/${encodeURIComponent(taskId)}/accept`, {}),
    onSettled: () => {
      void client.invalidateQueries({ queryKey: candidatesKey(taskId) });
      void client.invalidateQueries({ queryKey: resultKey(taskId) });
    },
  });
};

export interface ReturnResponse {
  task: { id: string; status: 'revision' };
  result: Result;
}

/**
 * POST /api/tasks/:id/return (api.md §4.2a, US-32, US-33). The customer sends the result back with a comment. Whatever the answer,
 * the customer's task (the candidate list answer carries its status) and the result are fetched again, so the page shows the real
 * state: after a 409 TASK_ALREADY_DONE or TASK_NOT_IN_REVIEW it shows what another tab or a double click already did.
 */
export const useReturnResult = (taskId: string) => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (comment: string) => apiPost<ReturnResponse>(`/tasks/${encodeURIComponent(taskId)}/return`, { comment }),
    onSettled: () => {
      void client.invalidateQueries({ queryKey: candidatesKey(taskId) });
      void client.invalidateQueries({ queryKey: resultKey(taskId) });
    },
  });
};
