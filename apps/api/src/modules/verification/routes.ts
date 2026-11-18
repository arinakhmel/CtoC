import { LIMITS, telegramUpdateSchema } from '@ctoc/shared';
import { Router } from 'express';
import { requireUser } from '../../http/auth';
import { receiveFile } from '../../http/upload';
import { validateBody } from '../../http/validate';
import { assertTelegramWebhook } from './policy';
import { serializeVerification } from './serializer';
import { getMyVerification, handleTelegramUpdate, submitDocument } from './service';

const receiveDocument = receiveFile(LIMITS.documentMaxBytes);

export function verificationRouter(): Router {
  const router = Router();

  router.post('/me/verification', requireUser, receiveDocument, async (req, res) => {
    const request = await submitDocument(req.user!, { bytes: req.file!.buffer, originalName: req.file!.originalname });
    res.status(201).json({ verification: serializeVerification(request) });
  });

  router.get('/me/verification', requireUser, async (req, res) => {
    const request = await getMyVerification(req.user!);
    res.json({ verification: request ? serializeVerification(request) : null });
  });

  // Public, but only Telegram knows the secret header (policy). Always 200 after that, so Telegram never retries.
  router.post(
    '/webhooks/telegram',
    (req, _res, next) => {
      assertTelegramWebhook(req.get('x-telegram-bot-api-secret-token'));
      next();
    },
    validateBody(telegramUpdateSchema),
    async (req, res) => {
      await handleTelegramUpdate(req.body);
      res.json({ ok: true });
    },
  );
  return router;
}
