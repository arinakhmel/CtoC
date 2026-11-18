import { createHash, randomUUID } from 'node:crypto';
import { checkResultUpload } from '@ctoc/shared';
import type { User } from '@prisma/client';
import { ApiError } from '../../errors';
import { prisma } from '../../platform/db';
import { getFileStorage } from '../../platform/ports/file-storage';
import { notifyResultSubmitted } from '../notifications/service';
import { getTaskForDelivery, lockTaskForDelivery, moveTaskToReview } from '../tasks/service';
import { claimedMime, hasRoomForAnotherFile, looksExecutable, takesFiles } from './domain';
import { assertCanDownload, assertIsExecutor } from './policy';
import {
  countFilesOfVersion,
  findCurrentVersion,
  findDraftVersion,
  findFileForDownload,
  findOpenVersion,
  insertDraftVersion,
  insertResultFile,
  nextVersionNumber,
  submitVersion,
} from './repo';

export interface UploadedResult {
  bytes: Buffer;
  originalName: string;
  mimetype?: string;
}

const fileError = (code: 'FILE_TYPE_NOT_ALLOWED' | 'FILE_TOO_LARGE' | 'VALIDATION_FAILED') =>
  new ApiError(code, { details: [{ field: 'file', code }] });

/**
 * Access check that runs before the file is received (ADR-0006): an unknown task is 404, a caller who is not the executor is 403
 * NOT_EXECUTOR, whatever the file is. Without it a stranger could send up to 50 MB and get a 400 about the file instead.
 */
export async function requireExecutorOf(user: User, taskId: string): Promise<void> {
  assertIsExecutor(await getTaskForDelivery(taskId), user);
}

/**
 * US-27 sc.1, sc.2, sc.3 (INV-14, INV-16). Only the executor, and only while the task accepts files. The type is checked by
 * name and by content, the size against the 50 MB limit. The bytes are stored first (file I/O stays outside the transaction),
 * then one transaction takes the task's write lock with a conditional update, finds or opens the draft version, counts its
 * files (so two uploads at once cannot make an eleventh) and links the new file. Nothing is left on disk when it fails.
 */
export async function uploadResultFile(user: User, taskId: string, upload: UploadedResult) {
  const task = await getTaskForDelivery(taskId);
  assertIsExecutor(task, user); // checked again here: the state may have changed since the route's early check
  if (task.refusal) throw new ApiError(task.refusal);

  if (upload.bytes.length === 0) throw fileError('VALIDATION_FAILED');
  const rejected = checkResultUpload({ mime: claimedMime(upload.mimetype), sizeBytes: upload.bytes.length, fileName: upload.originalName });
  if (rejected === 'FILE_TYPE_NOT_ALLOWED' || rejected === 'FILE_TOO_LARGE') throw fileError(rejected);
  if (looksExecutable(upload.bytes)) throw fileError('FILE_TYPE_NOT_ALLOWED');

  const storageKey = randomUUID();
  const storage = getFileStorage();
  await storage.put(storageKey, upload.bytes);
  try {
    await prisma.$transaction(async (tx) => {
      await lockTaskForDelivery(tx, task.id, user.id);
      const open = await findOpenVersion(tx, task.id);
      if (open && !takesFiles(open.status)) throw new ApiError('RESULT_LOCKED'); // INV-16: never a file into a submitted version
      const version = open ?? (await insertDraftVersion(tx, task.id, await nextVersionNumber(tx, task.id)));
      if (!hasRoomForAnotherFile(await countFilesOfVersion(tx, version.id))) throw new ApiError('TOO_MANY_FILES');
      await insertResultFile(tx, {
        ownerId: user.id,
        storageKey,
        originalName: upload.originalName,
        mime: claimedMime(upload.mimetype),
        sizeBytes: upload.bytes.length,
        sha256: createHash('sha256').update(upload.bytes).digest('hex'),
        resultVersionId: version.id,
      });
    });
  } catch (error) {
    await storage.delete(storageKey).catch(() => undefined); // no orphan file when nothing was saved
    throw error;
  }
  return findCurrentVersion(task.id);
}

/**
 * US-28 sc.1, sc.2, sc.3 (INV-14, INV-15, INV-16, INV-23, ADR-0007). The executor sends the result to the customer, in ONE
 * transaction that commits or rolls back as a whole:
 *   1. the task: conditional update `in_progress` or `revision` -> `in_review` (409 ALREADY_IN_REVIEW / INVALID_TRANSITION).
 *      It is the first write, so it is also the task lock that OQ-35 (i) asks every change of the version to take;
 *   2. the draft version must exist and hold at least one file (409 NO_RESULT_FILES), otherwise step 1 is rolled back;
 *   3. the version: conditional update `draft` -> `submitted`, with the time;
 *   4. the notification to the customer (US-48): created here, so a failed submit tells no one.
 * No file I/O in the transaction. A second request at the same time finds the task already `in_review`: 409.
 */
export async function submitResult(user: User, taskId: string) {
  const task = await getTaskForDelivery(taskId);
  assertIsExecutor(task, user); // 404 for an unknown task, 403 for anyone but the executor, before anything is written

  await prisma.$transaction(async (tx) => {
    await moveTaskToReview(tx, task.id, user.id);
    const draft = await findDraftVersion(tx, task.id);
    if (!draft || (await countFilesOfVersion(tx, draft.id)) === 0) throw new ApiError('NO_RESULT_FILES');
    if ((await submitVersion(tx, draft.id, new Date())).count === 0) throw new ApiError('INVALID_TRANSITION');
    await notifyResultSubmitted(tx, task.customerId, { id: task.id, title: task.title });
  });
  return { task: { id: task.id, status: 'in_review' as const }, version: await findCurrentVersion(task.id) };
}

/** US-27 sc.1. The current result of a task, for its executor. */
export async function getResult(user: User, taskId: string) {
  const task = await getTaskForDelivery(taskId);
  assertIsExecutor(task, user);
  return findCurrentVersion(task.id);
}

/** `GET /api/files/:fileId`. An unknown or deleted file is 404, someone else's file is 403 FILE_FORBIDDEN. */
export async function downloadFile(user: User, fileId: string) {
  const file = await findFileForDownload(fileId);
  if (!file) throw new ApiError('NOT_FOUND');
  assertCanDownload(file, user);
  const bytes = await getFileStorage()
    .get(file.storageKey)
    .catch(() => {
      throw new ApiError('NOT_FOUND'); // the row exists but the bytes are gone
    });
  return { bytes, name: file.originalName };
}
