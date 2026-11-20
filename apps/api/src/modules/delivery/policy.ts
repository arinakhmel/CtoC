import type { User } from '@prisma/client';
import { ApiError } from '../../errors';

/** `File.kind` of a document a student sent for verification (`FILE_KINDS` in @ctoc/shared). */
const STUDENT_DOCUMENT = 'student_document';

/** Access "Ex" of api.md (INV-14): only the executor of the task works with its result. An existing task of someone else is 403. */
export function assertIsExecutor(task: { executorId: string | null }, user: User): void {
  if (task.executorId === null || task.executorId !== user.id) throw new ApiError('NOT_EXECUTOR');
}

/** Access "Own" of api.md (INV-14, US-31 sc.2): only the customer who owns the task accepts its result. Anyone else is 403 NOT_TASK_OWNER. */
export function assertIsTaskOwner(task: { customerId: string }, user: User): void {
  if (task.customerId !== user.id) throw new ApiError('NOT_TASK_OWNER');
}

/**
 * `GET /api/tasks/:id/result` (US-27, US-31). The executor reads their own result, the owner reads what was sent for review.
 * Anyone else is 403 NOT_EXECUTOR (OQ-35 b). Returns which of the two it is, so the caller reads the right version.
 */
export function assertCanReadResult(task: { customerId: string; executorId: string | null }, user: User): 'executor' | 'owner' {
  if (task.executorId !== null && task.executorId === user.id) return 'executor';
  if (task.customerId === user.id) return 'owner';
  throw new ApiError('NOT_EXECUTOR');
}

/**
 * `GET /api/files/:fileId` (NFR-07). The owner of the file (the executor who uploaded it) downloads it. The customer who owns the
 * task downloads it too, but only once its version was sent for review (US-31): a file of a draft is still the executor's alone.
 * A moderator downloads only a student document (US-39, OQ-43 a: least privilege, ADR-0006); a result file is never theirs.
 */
export function assertCanDownload(file: { ownerId: string; kind: string }, user: User, isFileOfOwnedTaskUnderReview: boolean): void {
  if (file.ownerId === user.id || isFileOfOwnedTaskUnderReview) return;
  if (user.role === 'moderator' && file.kind === STUDENT_DOCUMENT) return;
  throw new ApiError('FILE_FORBIDDEN');
}
