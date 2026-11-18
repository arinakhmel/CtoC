import { createHash, randomUUID } from 'node:crypto';
import { checkResultUpload, type ReturnForRevisionInput } from '@ctoc/shared';
import type { User } from '@prisma/client';
import { ApiError } from '../../errors';
import { prisma } from '../../platform/db';
import { getFileStorage } from '../../platform/ports/file-storage';
import { createExperienceRecord } from '../experience/service';
import { notifyResultAccepted, notifyResultReturned, notifyResultSubmitted } from '../notifications/service';
import { payoutSplitOf } from '../payments/domain';
import { releaseEscrow } from '../payments/service';
import { getTaskForDelivery, lockTaskForDelivery, moveTaskToDone, moveTaskToReview, moveTaskToRevision } from '../tasks/service';
import { claimedMime, hasRoomForAnotherFile, looksExecutable, takesFiles } from './domain';
import { assertCanDownload, assertCanReadResult, assertIsExecutor, assertIsTaskOwner } from './policy';
import {
  acceptVersion,
  countFilesOfVersion,
  findCurrentVersion,
  findDraftVersion,
  findFileForDownload,
  findLastReturn,
  findOpenVersion,
  findResultFileLink,
  findSubmittedVersion,
  findVersionForOwner,
  insertDraftVersion,
  insertResultFile,
  isFileOfOwnedTaskUnderReview,
  markFileDeleted,
  nextVersionNumber,
  removeFileFromDraft,
  returnVersion,
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
  return { version: await findCurrentVersion(task.id), lastReturn: await lastReturnWhileInRevision(task) };
}

/** US-33. The comment of the last return, only while the task is in revision: what the student keeps reading after a new draft was started. */
const lastReturnWhileInRevision = (task: { id: string; inRevision: boolean }) => (task.inRevision ? findLastReturn(task.id) : Promise.resolve(null));

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

/**
 * US-29 sc.3 (INV-14, INV-16, ADR-0007). The executor deletes a file of the result, only from a DRAFT version and only while the
 * task is `in_progress` or `revision`. A submitted or returned version is never changed. ONE transaction:
 *   1. the task lock first (OQ-35 i): a task already `in_review` gives 0 rows, so 409 RESULT_LOCKED; `done` and `cancelled` give
 *      409 INVALID_TRANSITION. This is also what makes a delete and a submit at the same time safe: the one that gets the lock
 *      first decides, and a submit that finds the last file gone is 409 NO_RESULT_FILES (INV-15);
 *   2. the file must belong to this task (404 otherwise, so another task's file is not revealed), and to a draft (409 RESULT_LOCKED);
 *   3. the conditional delete of the link, and the mark `files.deleted_at`, each with its count checked.
 * The bytes are removed AFTER the commit (no file I/O in a transaction). If that fails it is logged and the request still succeeds:
 * the file is already out of the list and `GET /api/files/:fileId` answers 404 for it. A second delete of the same file is 404.
 */
export async function deleteResultFile(user: User, taskId: string, fileId: string): Promise<void> {
  const task = await getTaskForDelivery(taskId);
  assertIsExecutor(task, user); // 404 for an unknown task, 403 for anyone but the executor, before anything is written
  if (task.refusal) throw new ApiError(task.refusal); // a fast path only: the lock below decides

  const storageKey = await prisma.$transaction(async (tx) => {
    await lockTaskForDelivery(tx, task.id, user.id);
    const link = await findResultFileLink(tx, task.id, fileId);
    if (!link) throw new ApiError('NOT_FOUND');
    if (!takesFiles(link.resultVersion.status)) throw new ApiError('RESULT_LOCKED'); // INV-16: submitted and returned versions are fixed
    if ((await removeFileFromDraft(tx, task.id, fileId)).count === 0) throw new ApiError('NOT_FOUND');
    if ((await markFileDeleted(tx, fileId, user.id, new Date())).count === 0) throw new ApiError('NOT_FOUND');
    return link.file.storageKey;
  });

  await getFileStorage()
    .delete(storageKey)
    .catch((error: unknown) => {
      console.error(`Result file ${fileId} was deleted but its bytes were not removed`, error instanceof Error ? error.message : error);
    });
}

/**
 * US-27 sc.1, US-31. The result of a task. The executor reads their own current version, a draft included. The customer who owns
 * the task reads the latest version that was sent for review, accepted or returned, and never a draft (`null` while there is none).
 */
export async function getResult(user: User, taskId: string) {
  const task = await getTaskForDelivery(taskId);
  const version = assertCanReadResult(task, user) === 'executor' ? await findCurrentVersion(task.id) : await findVersionForOwner(task.id);
  return { version, lastReturn: await lastReturnWhileInRevision(task) };
}

/**
 * Access check that runs before the body of a return is read (ADR-0006): an unknown task is 404, anyone but the owner is 403
 * NOT_TASK_OWNER, whatever the comment is. Then the comment is validated (400), and only then the state of the task is judged (409).
 */
export async function requireOwnerOf(user: User, taskId: string): Promise<void> {
  assertIsTaskOwner(await getTaskForDelivery(taskId), user);
}

/**
 * US-32 sc.1, sc.2, US-33 sc.1 (INV-14, INV-17, INV-23, ADR-0007). The owner sends the result back for revision with a comment, in
 * ONE transaction that commits or rolls back as a whole. `input` is already validated (a comment of 1 to 2000 characters).
 *   1. the task: conditional update `in_review` -> `revision` (409 TASK_ALREADY_DONE / TASK_NOT_IN_REVIEW). It is the first write, so it is
 *      also the lock: a return and an accept at the same time, or two returns, cannot both win;
 *   2. the version under review: conditional update `submitted` -> `returned`, with the comment and the time;
 *   3. the notification to the student (US-33).
 * It changes no escrow, balance, ledger or experience record: the money stays held until the result is accepted. The files of the
 * returned version stay as they are (INV-16); the student's next upload opens a new draft. No file I/O inside.
 */
export async function returnResult(user: User, taskId: string, input: ReturnForRevisionInput) {
  const task = await getTaskForDelivery(taskId);
  assertIsTaskOwner(task, user); // checked again here: the route's check is only an early gate

  const { status, returnedAt } = await prisma.$transaction(async (tx) => {
    const now = new Date();
    const status = await moveTaskToRevision(tx, task.id, user.id);
    const version = await findSubmittedVersion(tx, task.id);
    if (!version || task.executorId === null || (await returnVersion(tx, version.id, input.comment, now)).count === 0) {
      console.error(`Task ${task.id} was in review without a submitted version or an executor: the return was rolled back`);
      throw new ApiError('INTERNAL_ERROR');
    }
    await notifyResultReturned(tx, task.executorId, { id: task.id, title: task.title });
    return { status, returnedAt: now };
  });
  const version = await findVersionForOwner(task.id); // the version that was just sent back is the latest one that is not a draft
  const lastReturn = version ? { version: version.version, revisionComment: input.comment, decidedAt: returnedAt } : null;
  return { task: { id: task.id, status }, version, lastReturn };
}

/**
 * US-31 sc.1, sc.2, sc.3 (INV-14, INV-18, INV-19, INV-20, INV-21, INV-23, ADR-0007). The owner accepts the result: one transaction
 * that commits or rolls back as a whole, so any failure leaves the task `in_review`, the escrow `held` and nothing credited:
 *   1. the task: conditional update `in_review` -> `done` with the time (409 TASK_ALREADY_DONE / TASK_NOT_IN_REVIEW). It is the first
 *      write, so it is also the task lock and the guard against a second accept at the same time;
 *   2. the price split taken at publication must exist and add up; if not (OQ-22) the accept is refused, never recomputed from
 *      today's rate: 500 INTERNAL_ERROR, logged, and step 1 is rolled back;
 *   3. the version under review: conditional update `submitted` -> `accepted`;
 *   4. the escrow is released through the PaymentProvider: `held` -> `released`, the student is credited the net amount, the platform
 *      the commission, each with its ledger entry (a second payout for the task is impossible, INV-19);
 *   5. the experience record of the student (US-37, one per task, INV-21);
 *   6. the notification to the student (US-30), the last step, so «Оплату нараховано» is only said when the payout is in.
 * No file I/O and no call outside the database. A repeat finds the task `done` and is 409 without any change.
 */
export async function acceptResult(user: User, taskId: string) {
  const task = await getTaskForDelivery(taskId);
  assertIsTaskOwner(task, user); // 404 for an unknown task, 403 NOT_TASK_OWNER for anyone but the owner, before anything is written

  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const facts = await moveTaskToDone(tx, task.id, user.id, now);
    const split = payoutSplitOf(facts);
    if (!split || facts.executorId === null || facts.completedAt === null) {
      console.error(`Task ${task.id} cannot be accepted: it has no usable price split (commission snapshot) or no executor (OQ-22)`);
      throw new ApiError('INTERNAL_ERROR');
    }
    const version = await findSubmittedVersion(tx, task.id);
    if (!version || (await acceptVersion(tx, version.id, now)).count === 0) {
      console.error(`Task ${task.id} was in review without a submitted version: the accept was rolled back`);
      throw new ApiError('INTERNAL_ERROR');
    }
    await releaseEscrow(tx, { taskId: task.id, studentId: facts.executorId, ...split });
    const experienceRecordId = await createExperienceRecord(tx, {
      studentId: facts.executorId,
      taskId: task.id,
      title: facts.title,
      description: facts.description,
      completedAt: facts.completedAt,
    });
    await notifyResultAccepted(tx, facts.executorId, { id: task.id, title: facts.title });
    return { task: { id: task.id, status: 'done' as const, completedAt: facts.completedAt }, payout: split, experienceRecordId };
  });
}

/** `GET /api/files/:fileId`. An unknown or deleted file is 404, someone else's file is 403 FILE_FORBIDDEN. */
export async function downloadFile(user: User, fileId: string) {
  const file = await findFileForDownload(fileId);
  if (!file) throw new ApiError('NOT_FOUND');
  assertCanDownload(file, user, file.ownerId === user.id ? false : await isFileOfOwnedTaskUnderReview(fileId, user.id));
  const bytes = await getFileStorage()
    .get(file.storageKey)
    .catch(() => {
      throw new ApiError('NOT_FOUND'); // the row exists but the bytes are gone
    });
  return { bytes, name: file.originalName };
}
