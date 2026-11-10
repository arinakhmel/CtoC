import { Router } from 'express';
import { ApiError } from '../../errors';
import { getOutbox } from '../../platform/ports/mailer';

/** api.md "Development only": the outbox with confirmation links. 404 in production. */
export function devRouter(): Router {
  const router = Router();
  router.get('/dev/outbox', (_req, res) => {
    if (process.env.NODE_ENV === 'production') throw new ApiError('NOT_FOUND');
    res.json({ emails: getOutbox() });
  });
  return router;
}
