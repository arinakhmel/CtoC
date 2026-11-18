import type { Prisma } from '@prisma/client';
import { prisma } from '../../platform/db';

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
  tx.resultVersion.findFirst({ where: { taskId, status: { in: ['draft', 'submitted'] } }, select: { id: true, status: true } });

export const nextVersionNumber = async (tx: Tx, taskId: string): Promise<number> => {
  const last = await tx.resultVersion.aggregate({ where: { taskId }, _max: { version: true } });
  return (last._max.version ?? 0) + 1;
};

export const insertDraftVersion = (tx: Tx, taskId: string, version: number) =>
  tx.resultVersion.create({ data: { taskId, version, status: 'draft' }, select: { id: true } });

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
