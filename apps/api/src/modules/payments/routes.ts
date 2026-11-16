import { sandboxTopUpSchema, type SandboxTopUpInput } from '@ctoc/shared';
import { Router, type RequestHandler } from 'express';
import { requireUser } from '../../http/auth';
import { validateBody } from '../../http/validate';
import { assertCanReadBalance, assertCanTopUp } from './policy';
import { serializeBalance } from './serializer';
import { getMyBalance, topUpBalance } from './service';

/** The access checks as steps of their own, so they run before the body is validated (403 before 400). */
const requireTopUpAccess: RequestHandler = (req, _res, next) => {
  assertCanTopUp(req.user!);
  next();
};
const requireReadAccess: RequestHandler = (req, _res, next) => {
  assertCanReadBalance(req.user!);
  next();
};

export function paymentsRouter(): Router {
  const router = Router();

  // no-store, like the public profile: a balance that just changed (a top-up, a hold) must show on the next request.
  router.get('/me/balance', requireUser, requireReadAccess, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(serializeBalance(await getMyBalance(req.user!)));
  });

  // SANDBOX (A-06): money from nowhere, labelled on the page. Not part of the PaymentProvider port.
  router.post('/me/balance/sandbox-topup', requireUser, requireTopUpAccess, validateBody(sandboxTopUpSchema), async (req, res) => {
    res.json(serializeBalance(await topUpBalance(req.user!, req.body as SandboxTopUpInput)));
  });

  return router;
}
