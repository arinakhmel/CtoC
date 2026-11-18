import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../../lib/api';

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
