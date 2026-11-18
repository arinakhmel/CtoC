import type { findCurrentVersion, findLastReturn } from './repo';

type Version = NonNullable<Awaited<ReturnType<typeof findCurrentVersion>>>;
type LastReturn = NonNullable<Awaited<ReturnType<typeof findLastReturn>>>;

/**
 * api.md §4.14. No storage key and no hash leave the server. `lastReturn` is the latest comment of the customer, given while the
 * task is in revision (US-33): the student keeps reading it after a new draft was started, when the current version has no comment.
 * It is `null` at any other time.
 */
export const serializeResult = (version: Version | null, lastReturn: LastReturn | null = null) => ({
  result: version && {
    version: version.version,
    status: version.status,
    revisionComment: version.revisionComment,
    submittedAt: version.submittedAt?.toISOString() ?? null,
    lastReturn: lastReturn && lastReturn.revisionComment !== null
      ? { version: lastReturn.version, comment: lastReturn.revisionComment, returnedAt: lastReturn.decidedAt?.toISOString() ?? null }
      : null,
    files: version.files.map(({ file }) => ({
      id: file.id,
      name: file.originalName,
      mime: file.mime,
      sizeBytes: file.sizeBytes,
      createdAt: file.createdAt.toISOString(),
    })),
  },
});
