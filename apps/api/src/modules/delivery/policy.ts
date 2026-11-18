import type { User } from '@prisma/client';
import { ApiError } from '../../errors';

/** Access "Ex" of api.md (INV-14): only the executor of the task works with its result. An existing task of someone else is 403. */
export function assertIsExecutor(task: { executorId: string | null }, user: User): void {
  if (task.executorId === null || task.executorId !== user.id) throw new ApiError('NOT_EXECUTOR');
}

/**
 * `GET /api/files/:fileId` (NFR-07). In US-27 the owner of the file downloads it. The task's customer joins with US-31 and the
 * moderator with US-39, each with the story that needs it.
 */
export function assertCanDownload(file: { ownerId: string }, user: User): void {
  if (file.ownerId !== user.id) throw new ApiError('FILE_FORBIDDEN');
}
