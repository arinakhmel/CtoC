import { sandboxTopUpSchema, type SandboxTopUpInput } from '@ctoc/shared';
import { Router, type RequestHandler } from 'express';
import { requireUser } from '../../http/auth';
import { rateLimit } from '../../http/rate-limit';
import { validateBody } from '../../http/validate';
import { assertCanReadBalance, assertCanReadFinance, assertCanTopUp } from './policy';
import { serializeBalance, serializeFinance } from './serializer';
import { getMyBalance, getMyFinance, topUpBalance } from './service';

/** The access checks as steps of their own, so they run before the body is validated (403 before 400). */
const requireTopUpAccess: RequestHandler = (req, _res, next) => {
  assertCanTopUp(req.user!);
  next();
};
const requireReadAccess: RequestHandler = (req, _res, next) => {
  assertCanReadBalance(req.user!);
  next();
};

const requireFinanceAccess: RequestHandler = (req, _res, next) => {
  assertCanReadFinance(req.user!);
  next();
};

export function paymentsRouter(): Router {
  const router = Router();

  // no-store comes from the API-wide middleware of app.ts: a balance that just changed must show on the next request.
  router.get('/me/balance', requireUser, requireReadAccess, async (req, res) => {
    res.json(serializeBalance(await getMyBalance(req.user!)));
  });

  // US-35, US-34: the student's balance and the per-task breakdown (api.md §4.1b). Students only.
  router.get('/me/finance', requireUser, requireFinanceAccess, async (req, res) => {
    const { availableKopecks, tasks } = await getMyFinance(req.user!);
    res.json(serializeFinance(availableKopecks, tasks));
  });

  // SANDBOX (A-06): money from nowhere, labelled on the page. Not part of the PaymentProvider port.
  router.post('/me/balance/sandbox-topup', requireUser, requireTopUpAccess, rateLimit({ max: 30, windowMs: 60_000 }), validateBody(sandboxTopUpSchema), async (req, res) => {
    res.json(serializeBalance(await topUpBalance(req.user!, req.body as SandboxTopUpInput)));
  });

  return router;
}
