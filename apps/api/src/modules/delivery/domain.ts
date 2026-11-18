import { isExecutableContent, LIMITS } from '@ctoc/shared';

/** The content type kept for a result file. It is the browser's claim, so it is only ever shown, never served (see the download route). */
export const claimedMime = (mime: string | undefined): string =>
  mime && mime.length <= 100 && /^[\w.+-]+\/[\w.+-]+$/.test(mime) ? mime.toLowerCase() : 'application/octet-stream';

/** US-27 sc.2 (OQ-18): a renamed executable is caught by its first bytes, not only by its extension. */
export const looksExecutable = (bytes: Buffer): boolean => isExecutableContent(bytes);

/** INV-15 limit (domain-model.md, `[prop]`): a result version holds at most this many files. */
export const hasRoomForAnotherFile = (filesInVersion: number): boolean => filesInVersion < LIMITS.resultFilesMax;

/** `GET /api/files/:fileId` is always a download, whatever the file claims to be (no HTML or script served from our origin). */
export const DOWNLOAD_CONTENT_TYPE = 'application/octet-stream';
