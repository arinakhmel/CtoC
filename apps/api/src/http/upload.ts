import type { Request, RequestHandler } from 'express';
import multer from 'multer';
import { ApiError } from '../errors';

const fileError = (code: 'FILE_TOO_LARGE' | 'VALIDATION_FAILED') => new ApiError(code, { details: [{ field: 'file', code }] });

/**
 * One file in the field `file`, kept in memory (api.md Conventions). A too large file becomes FILE_TOO_LARGE, a missing or
 * extra one a 400 VALIDATION_FAILED. `maxBytes` is the limit of the endpoint: exactly that many bytes pass, one more does not.
 * File names arrive as UTF-8, so a Cyrillic name is kept as the browser sent it.
 */
export function receiveFile(maxBytes: number): RequestHandler {
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: maxBytes, files: 1 }, defParamCharset: 'utf8' });
  return (req, res, next) => {
    upload.single('file')(req, res, (error: unknown) => {
      if (error instanceof multer.MulterError) {
        next(fileError(error.code === 'LIMIT_FILE_SIZE' ? 'FILE_TOO_LARGE' : 'VALIDATION_FAILED'));
        return;
      }
      if (error) {
        next(error);
        return;
      }
      next((req as Request).file ? undefined : fileError('VALIDATION_FAILED'));
    });
  };
}
