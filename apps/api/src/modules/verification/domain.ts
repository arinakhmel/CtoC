/**
 * Detects the type of a student document from its first bytes, not from the file name or the browser's
 * claim (ADR-0004, US-08/S2). Returns null for anything that is not JPEG, PNG or PDF, so a renamed
 * .exe or .zip is rejected.
 */
export function detectDocumentMime(bytes: Buffer): 'image/jpeg' | 'image/png' | 'application/pdf' | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (bytes.length >= 5 && bytes.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  return null;
}
