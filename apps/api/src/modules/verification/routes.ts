import { LIMITS } from '@ctoc/shared';
import { Router, type RequestHandler } from 'express';
import multer from 'multer';
import { ApiError } from '../../errors';
import { requireUser } from '../../http/auth';
import { serializeVerification } from './serializer';
import { getMyVerification, submitDocument } from './service';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: LIMITS.documentMaxBytes, files: 1 } });

const fileError = (code: 'FILE_TOO_LARGE' | 'VALIDATION_FAILED') => new ApiError(code, { details: [{ field: 'file', code }] });

/** One file in the field `file` (api.md Conventions). A too large file becomes FILE_TOO_LARGE, a missing one a 400. */
const receiveFile: RequestHandler = (req, res, next) => {
  upload.single('file')(req, res, (error: unknown) => {
    if (error instanceof multer.MulterError) {
      next(fileError(error.code === 'LIMIT_FILE_SIZE' ? 'FILE_TOO_LARGE' : 'VALIDATION_FAILED'));
      return;
    }
    if (error) {
      next(error);
      return;
    }
    next(req.file ? undefined : fileError('VALIDATION_FAILED'));
  });
};

export function verificationRouter(): Router {
  const router = Router();

  router.post('/me/verification', requireUser, receiveFile, async (req, res) => {
    const request = await submitDocument(req.user!, { bytes: req.file!.buffer, originalName: req.file!.originalname });
    res.status(201).json({ verification: serializeVerification(request) });
  });

  router.get('/me/verification', requireUser, async (req, res) => {
    const request = await getMyVerification(req.user!);
    res.json({ verification: request ? serializeVerification(request) : null });
  });
  return router;
}
