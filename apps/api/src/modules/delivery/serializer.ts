import type { findCurrentVersion } from './repo';

type Version = NonNullable<Awaited<ReturnType<typeof findCurrentVersion>>>;

/** api.md §4.14. No storage key and no hash leave the server. */
export const serializeResult = (version: Version | null) => ({
  result: version && {
    version: version.version,
    status: version.status,
    revisionComment: version.revisionComment,
    submittedAt: version.submittedAt?.toISOString() ?? null,
    files: version.files.map(({ file }) => ({
      id: file.id,
      name: file.originalName,
      mime: file.mime,
      sizeBytes: file.sizeBytes,
      createdAt: file.createdAt.toISOString(),
    })),
  },
});
