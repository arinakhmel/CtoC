// Upload rules. They return an error code, or null when the file is acceptable (api.md §3).
import { LIMITS } from './limits';
import type { ErrorCode } from './errors';

export interface UploadInfo {
  /** Content type detected from the file bytes, not from the extension. */
  mime: string;
  sizeBytes: number;
  fileName: string;
}

const DOCUMENT_MIMES = new Set(['image/jpeg', 'image/png', 'application/pdf']);
const BLOCKED_RESULT_EXTENSIONS = new Set(['exe', 'bat', 'cmd', 'com', 'scr', 'msi', 'ps1', 'vbs']);

const extensionOf = (fileName: string) => fileName.split('.').pop()?.toLowerCase() ?? '';

/** Student status document: JPG, PNG or PDF, at most 10 MB (US-08/S1, S2, S3). */
export function checkDocumentUpload(file: UploadInfo): ErrorCode | null {
  if (!DOCUMENT_MIMES.has(file.mime)) return 'FILE_TYPE_NOT_ALLOWED';
  if (file.sizeBytes > LIMITS.documentMaxBytes) return 'FILE_TOO_LARGE';
  return null;
}

/** Result file: executables are blocked, at most 50 MB (US-27/S2, S3). */
export function checkResultUpload(file: UploadInfo): ErrorCode | null {
  if (BLOCKED_RESULT_EXTENSIONS.has(extensionOf(file.fileName))) return 'FILE_TYPE_NOT_ALLOWED';
  if (file.sizeBytes > LIMITS.resultMaxBytes) return 'FILE_TOO_LARGE';
  return null;
}
