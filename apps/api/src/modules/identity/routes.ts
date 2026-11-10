import { confirmEmailSchema, registerSchema, resendConfirmationSchema } from '@ctoc/shared';
import { Router } from 'express';
import { rateLimit } from '../../http/rate-limit';
import { validateBody } from '../../http/validate';
import { serializeConfirmed, serializeRegistered } from './serializer';
import { confirmEmail, register, resendConfirmation } from './service';

export function identityRouter(): Router {
  const router = Router();
  // 10 sign-ups per hour per IP (proposal; api.md §1 lists 429 for register).
  router.post('/auth/register', rateLimit({ max: 10, windowMs: 3600_000 }), validateBody(registerSchema), async (req, res) => {
    const user = await register(req.body);
    res.status(201).json(serializeRegistered(user));
  });

  router.post('/auth/confirm-email', validateBody(confirmEmailSchema), async (req, res) => {
    const user = await confirmEmail(req.body.token);
    res.status(200).json(serializeConfirmed(user));
  });

  // 5 resends per hour per IP (proposal).
  router.post('/auth/resend-confirmation', rateLimit({ max: 5, windowMs: 3600_000 }), validateBody(resendConfirmationSchema), async (req, res) => {
    await resendConfirmation(req.body.email);
    res.status(202).end();
  });
  return router;
}
