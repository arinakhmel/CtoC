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

/**
 * US-27/S2 (domain-model.md, OQ-18): executables detected by their content, so a renamed file is caught too. Windows
 * PE ("MZ"), ELF, Mach-O (both byte orders, 32 and 64 bit, and the fat header), and scripts with a `#!` line. This is a
 * check of the first bytes, not a virus scan, and archives are not opened.
 */
export function isExecutableContent(bytes: Uint8Array): boolean {
  const starts = (...signature: number[]) => signature.every((byte, index) => bytes[index] === byte);
  return (
    starts(0x4d, 0x5a) || // MZ: .exe, .scr, .com, .dll
    starts(0x7f, 0x45, 0x4c, 0x46) || // ELF
    starts(0xfe, 0xed, 0xfa, 0xce) ||
    starts(0xfe, 0xed, 0xfa, 0xcf) ||
    starts(0xce, 0xfa, 0xed, 0xfe) ||
    starts(0xcf, 0xfa, 0xed, 0xfe) ||
    starts(0xca, 0xfe, 0xba, 0xbe) || // Mach-O fat (also a Java class, blocked as well)
    starts(0x23, 0x21) // #!
  );
}
