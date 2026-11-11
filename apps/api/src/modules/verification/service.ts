import { createHash, randomUUID } from 'node:crypto';
import { checkDocumentUpload } from '@ctoc/shared';
import { Prisma, type User } from '@prisma/client';
import { ApiError } from '../../errors';
import { prisma } from '../../platform/db';
import { getFileStorage } from '../../platform/ports/file-storage';
import { detectDocumentMime } from './domain';
import { assertStudentWithConfirmedEmail } from './policy';
import { findLatestRequest, guardNotVerified, insertDocumentFile, insertPendingRequest } from './repo';

export interface UploadedDocument {
  bytes: Buffer;
  originalName: string;
}

/**
 * US-08. Checks the file by its content (type and size), stores it, then creates the File row and the
 * pending request in one transaction. INV-04 (one pending request per user) is the partial unique index.
 * The user never gets the student role from this: studentVerifiedAt is set only by a moderator (INV-03).
 */
export async function submitDocument(user: User, upload: UploadedDocument) {
  assertStudentWithConfirmedEmail(user);

  const mime = detectDocumentMime(upload.bytes);
  const rejected = checkDocumentUpload({
    mime: mime ?? 'application/octet-stream',
    sizeBytes: upload.bytes.length,
    fileName: upload.originalName,
  });
  if (rejected) throw new ApiError(rejected, { details: [{ field: 'file', code: rejected }] });

  const storageKey = randomUUID();
  const storage = getFileStorage();
  await storage.put(storageKey, upload.bytes); // file I/O stays outside the transaction

  try {
    return await prisma.$transaction(async (tx) => {
      const guard = await guardNotVerified(tx, user.id);
      if (guard.count === 0) throw new ApiError('ALREADY_VERIFIED');

      const file = await insertDocumentFile(tx, {
        ownerId: user.id,
        storageKey,
        originalName: upload.originalName,
        mime: mime!,
        sizeBytes: upload.bytes.length,
        sha256: createHash('sha256').update(upload.bytes).digest('hex'),
      });
      try {
        return await insertPendingRequest(tx, { userId: user.id, fileId: file.id });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new ApiError('VERIFICATION_PENDING');
        }
        throw error;
      }
    });
  } catch (error) {
    await storage.delete(storageKey).catch(() => undefined); // no orphan file when nothing was saved
    throw error;
  }
}

export async function getMyVerification(user: User) {
  assertStudentWithConfirmedEmail(user);
  return findLatestRequest(user.id);
}
