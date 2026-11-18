import { isExecutableContent, LIMITS, type ResultVersionStatus } from '@ctoc/shared';

/**
 * domain-model.md §3.1 (result version): `draft` -> `submitted` (US-28) -> `accepted` or `returned` (US-31, US-32). A new
 * version starts as `draft`. Only a draft takes files (INV-16). The repo writes these values and nowhere else names them.
 */
export const DRAFT = 'draft' as const satisfies ResultVersionStatus;
export const SUBMITTED = 'submitted' as const satisfies ResultVersionStatus;
/** The version a task may have open at a time: the one being filled, or the one under review (a partial unique index). */
export const OPEN_VERSION_STATUSES = [DRAFT, SUBMITTED] as const;
/** INV-16: files go only into a draft. A submitted or decided version is never given one. */
export const takesFiles = (versionStatus: string): boolean => versionStatus === DRAFT;

/** The content type kept for a result file. It is the browser's claim, so it is only ever shown, never served (see the download route). */
export const claimedMime = (mime: string | undefined): string =>
  mime && mime.length <= 100 && /^[\w.+-]+\/[\w.+-]+$/.test(mime) ? mime.toLowerCase() : 'application/octet-stream';

/** US-27 sc.2 (OQ-18): a renamed executable is caught by its first bytes, not only by its extension. */
export const looksExecutable = (bytes: Buffer): boolean => isExecutableContent(bytes);

/** INV-15 limit (domain-model.md, `[prop]`): a result version holds at most this many files. */
export const hasRoomForAnotherFile = (filesInVersion: number): boolean => filesInVersion < LIMITS.resultFilesMax;

/** `GET /api/files/:fileId` is always a download, whatever the file claims to be (no HTML or script served from our origin). */
export const DOWNLOAD_CONTENT_TYPE = 'application/octet-stream';
