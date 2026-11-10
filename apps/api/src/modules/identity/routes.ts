import { registerSchema } from '@ctoc/shared';
import { Router } from 'express';
import { rateLimit } from '../../http/rate-limit';
import { validateBody } from '../../http/validate';
import { serializeRegistered } from './serializer';
import { register } from './service';

export function identityRouter(): Router {
  const router = Router();
  // 10 sign-ups per hour per IP (proposal; api.md §1 lists 429 for register).
  router.post('/auth/register', rateLimit({ max: 10, windowMs: 3600_000 }), validateBody(registerSchema), async (req, res) => {
    const user = await register(req.body);
    res.status(201).json(serializeRegistered(user));
  });
  return router;
}
