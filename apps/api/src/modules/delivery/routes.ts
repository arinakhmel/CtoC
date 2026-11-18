import { LIMITS, returnForRevisionSchema, type ReturnForRevisionInput } from '@ctoc/shared';
import { Router, type RequestHandler } from 'express';
import { requireUser } from '../../http/auth';
import { receiveFile } from '../../http/upload';
import { validateBody } from '../../http/validate';
import { DOWNLOAD_CONTENT_TYPE } from './domain';
import { serializeResult } from './serializer';
import {
  acceptResult,
  deleteResultFile,
  downloadFile,
  getResult,
  requireExecutorOf,
  requireOwnerOf,
  returnResult,
  submitResult,
  uploadResultFile,
} from './service';

const receiveResultFile = receiveFile(LIMITS.resultMaxBytes);

/** The access check as a step of its own, before the body is read (403 and 404 before 400, ADR-0006). */
const requireExecutor: RequestHandler = async (req, _res, next) => {
  await requireExecutorOf(req.user!, String(req.params.id));
  next();
};

/** The owner check as a step of its own, before the comment is validated (403 and 404 before 400, ADR-0006). */
const requireOwner: RequestHandler = async (req, _res, next) => {
  await requireOwnerOf(req.user!, String(req.params.id));
  next();
};

export function deliveryRouter(): Router {
  const router = Router();

  router.post('/tasks/:id/result/files', requireUser, requireExecutor, receiveResultFile, async (req, res) => {
    const { version, lastReturn } = await uploadResultFile(req.user!, String(req.params.id), {
      bytes: req.file!.buffer,
      originalName: req.file!.originalname,
      mimetype: req.file!.mimetype,
    });
    res.status(201).json(serializeResult(version, lastReturn));
  });

  router.delete('/tasks/:id/result/files/:fileId', requireUser, async (req, res) => {
    await deleteResultFile(req.user!, String(req.params.id), String(req.params.fileId));
    res.status(204).end();
  });

  router.post('/tasks/:id/result/submit', requireUser, async (req, res) => {
    const { task, version } = await submitResult(req.user!, String(req.params.id));
    res.json({ task, ...serializeResult(version) });
  });

  router.post('/tasks/:id/accept', requireUser, async (req, res) => {
    const { task, payout, experienceRecordId } = await acceptResult(req.user!, String(req.params.id));
    res.json({ task: { ...task, completedAt: task.completedAt.toISOString() }, payout, experienceRecordId });
  });

  router.get('/tasks/:id/result', requireUser, async (req, res) => {
    const { version, lastReturn } = await getResult(req.user!, String(req.params.id));
    res.json(serializeResult(version, lastReturn));
  });

  // The order of the checks (decided): access (401, 404, 403) -> the comment (400) -> the state of the task (409).
  router.post('/tasks/:id/return', requireUser, requireOwner, validateBody(returnForRevisionSchema), async (req, res) => {
    const { task, version, lastReturn } = await returnResult(req.user!, String(req.params.id), req.body as ReturnForRevisionInput);
    res.json({ task, ...serializeResult(version, lastReturn) });
  });

  router.get('/files/:fileId', requireUser, async (req, res) => {
    const { bytes, name } = await downloadFile(req.user!, String(req.params.fileId));
    res.attachment(name); // Content-Disposition: attachment, the name encoded
    res.type(DOWNLOAD_CONTENT_TYPE); // never what the uploader claimed
    res.set({ 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store' });
    res.send(bytes);
  });

  return router;
}
