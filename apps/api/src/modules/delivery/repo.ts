import type { Prisma } from '@prisma/client';
import { prisma } from '../../platform/db';
import { ACCEPTED, DRAFT, OPEN_VERSION_STATUSES, SUBMITTED } from './domain';

type Tx = Prisma.TransactionClient;

const versionSelect = {
  id: true,
  version: true,
  status: true,
  revisionComment: true,
  submittedAt: true,
  files: {
    select: { file: { select: { id: true, originalName: true, mime: true, sizeBytes: true, createdAt: true } } },
    orderBy: { file: { createdAt: 'asc' } },
  },
} satisfies Prisma.ResultVersionSelect;

/**
 * The one open version of the task (a partial unique index allows at most one): a `draft` the executor is filling, or a
 * `submitted` one under review. The caller must check the status: files go only into a draft (INV-16).
 */
export const findOpenVersion = (tx: Tx, taskId: string) =>
  tx.resultVersion.findFirst({ where: { taskId, status: { in: [...OPEN_VERSION_STATUSES] } }, select: { id: true, status: true } });

export const nextVersionNumber = async (tx: Tx, taskId: string): Promise<number> => {
  const last = await tx.resultVersion.aggregate({ where: { taskId }, _max: { version: true } });
  return (last._max.version ?? 0) + 1;
};

export const insertDraftVersion = (tx: Tx, taskId: string, version: number) =>
  tx.resultVersion.create({ data: { taskId, version, status: DRAFT }, select: { id: true } });

export const countFilesOfVersion = (tx: Tx, resultVersionId: string) => tx.resultFile.count({ where: { resultVersionId } });

export const insertResultFile = async (
  tx: Tx,
  data: { ownerId: string; storageKey: string; originalName: string; mime: string; sizeBytes: number; sha256: string; resultVersionId: string },
) => {
  const { resultVersionId, ...file } = data;
  const row = await tx.file.create({ data: { ...file, kind: 'result' } });
  await tx.resultFile.create({ data: { resultVersionId, fileId: row.id } });
  return row;
};

/** The version to show: the latest one (the open one while the executor works). `null` before the first upload. */
export const findCurrentVersion = (taskId: string) =>
  prisma.resultVersion.findFirst({ where: { taskId }, orderBy: { version: 'desc' }, select: versionSelect });

export const findFileForDownload = (id: string) =>
  prisma.file.findFirst({ where: { id, deletedAt: null }, select: { id: true, ownerId: true, kind: true, storageKey: true, originalName: true } });

/** US-28. The draft the executor is filling, which is the version a submit sends. */
export const findDraftVersion = (tx: Tx, taskId: string) =>
  tx.resultVersion.findFirst({ where: { taskId, status: DRAFT }, select: { id: true } });

/**
 * US-28 sc.1 (INV-15, ADR-0007). The conditional update `draft` -> `submitted`. `count` 0 means the version is no longer a
 * draft, which the task lock above it should already have made impossible.
 */
export const submitVersion = (tx: Tx, id: string, now: Date) =>
  tx.resultVersion.updateMany({ where: { id, status: DRAFT }, data: { status: SUBMITTED, submittedAt: now } });

/**
 * US-29. The link of a file to a version of this task, with the status of that version. A file that was deleted is not found.
 * The service uses it to tell "no such file" (404) from "its version is no longer a draft" (409 RESULT_LOCKED).
 */
export const findResultFileLink = (tx: Tx, taskId: string, fileId: string) =>
  tx.resultFile.findFirst({
    where: { fileId, resultVersion: { taskId }, file: { deletedAt: null } },
    select: { resultVersion: { select: { status: true } }, file: { select: { storageKey: true } } },
  });

/**
 * US-29 sc.3 (INV-16, ADR-0007). The conditional delete of the link: only a file of a DRAFT version of this task. `count` 0 means
 * the file is gone or its version is no longer a draft. The link goes, so the file leaves the list and the limit of ten
 * (both count `result_files` rows); the `files` row stays and is marked deleted.
 */
export const removeFileFromDraft = (tx: Tx, taskId: string, fileId: string) =>
  tx.resultFile.deleteMany({ where: { fileId, resultVersion: { taskId, status: DRAFT } } });

/** US-29. Marks the executor's own result file as deleted (the column `files.deleted_at`). `count` 0: not theirs, or already marked. */
export const markFileDeleted = (tx: Tx, fileId: string, ownerId: string, now: Date) =>
  tx.file.updateMany({ where: { id: fileId, ownerId, kind: 'result', deletedAt: null }, data: { deletedAt: now } });

/** US-31. The version the customer sees: the latest one that was sent for review, accepted or returned. A draft is never shown. `null` if there is none. */
export const findVersionForOwner = (taskId: string) =>
  prisma.resultVersion.findFirst({ where: { taskId, status: { not: DRAFT } }, orderBy: { version: 'desc' }, select: versionSelect });

/** US-31. Whether this file is in a version, not a draft, of a task that this user owns: then the customer may download it. */
export const isFileOfOwnedTaskUnderReview = async (fileId: string, ownerId: string): Promise<boolean> =>
  (await prisma.resultFile.count({ where: { fileId, file: { deletedAt: null }, resultVersion: { status: { not: DRAFT }, task: { customerId: ownerId } } } })) > 0;

/** US-31. The version under review, which an accept decides. */
export const findSubmittedVersion = (tx: Tx, taskId: string) => tx.resultVersion.findFirst({ where: { taskId, status: SUBMITTED }, select: { id: true } });

/**
 * US-31 sc.1 (INV-18, ADR-0007). The conditional update `submitted` -> `accepted`, with the time of the decision. `count` 0 means
 * the version is not under review, which the task lock above it should already have made impossible.
 */
export const acceptVersion = (tx: Tx, id: string, now: Date) =>
  tx.resultVersion.updateMany({ where: { id, status: SUBMITTED }, data: { status: ACCEPTED, decidedAt: now } });
