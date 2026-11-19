import { moderationRejectSchema, modWithdrawalsQuerySchema, type ModWithdrawalsQuery } from '@ctoc/shared';
import { Router, type RequestHandler } from 'express';
import { requireUser } from '../../http/auth';
import { parsedQuery, validateBody, validateQuery } from '../../http/validate';
import { assertModerator } from './policy';
import { serializeModWithdrawal, serializeModWithdrawals } from './serializer';
import { getWithdrawalQueue, payWithdrawal, refuseWithdrawal } from './service';

/** INV-25 as a step of its own, so a non-moderator gets 403 before the query or the body is looked at. */
const requireModerator: RequestHandler = (req, _res, next) => {
  assertModerator(req.user!);
  next();
};

/** Back office (api.md "Moderation and admin"). Withdrawals for now: A-10, OQ-10, US-36. */
export function adminRouter(): Router {
  const router = Router();

  router.get('/mod/withdrawals', requireUser, requireModerator, validateQuery(modWithdrawalsQuerySchema), async (req, res) => {
    res.json(serializeModWithdrawals(await getWithdrawalQueue(req.user!, parsedQuery<ModWithdrawalsQuery>(res).status)));
  });

  router.post('/mod/withdrawals/:id/mark-paid', requireUser, requireModerator, async (req, res) => {
    res.json({ withdrawal: serializeModWithdrawal(await payWithdrawal(req.user!, String(req.params.id))) });
  });

  router.post('/mod/withdrawals/:id/reject', requireUser, requireModerator, validateBody(moderationRejectSchema), async (req, res) => {
    res.json({ withdrawal: serializeModWithdrawal(await refuseWithdrawal(req.user!, String(req.params.id), (req.body as { reason: string }).reason)) });
  });

  return router;
}
