import { moderationRejectSchema, modTasksQuerySchema, modVerificationsQuerySchema, modWithdrawalsQuerySchema, type ModTasksQuery, type ModVerificationsQuery, type ModWithdrawalsQuery } from '@ctoc/shared';
import { Router, type RequestHandler } from 'express';
import { requireUser } from '../../http/auth';
import { parsedQuery, validateBody, validateQuery } from '../../http/validate';
import { assertModerator } from './policy';
import { serializeModTask } from '../tasks/serializer';
import { serializeModVerification } from '../verification/serializer';
import { serializeModWithdrawal, serializeModWithdrawals } from './serializer';
import { approveVerification, getTaskQueue, getVerificationQueue, publishTaskByModerator, rejectTaskByModerator, getWithdrawalQueue, payWithdrawal, refuseWithdrawal, rejectVerification } from './service';

/** INV-25 as a step of its own, so a non-moderator gets 403 before the query or the body is looked at. */
const requireModerator: RequestHandler = (req, _res, next) => {
  assertModerator(req.user!);
  next();
};

/** Back office (api.md "Moderation and admin"): withdrawals (A-10, OQ-10, US-36) and student documents (US-39). */
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

  router.get('/mod/verifications', requireUser, requireModerator, validateQuery(modVerificationsQuerySchema), async (req, res) => {
    const rows = await getVerificationQueue(req.user!, parsedQuery<ModVerificationsQuery>(res));
    res.json({ items: rows.map(serializeModVerification) });
  });

  router.post('/mod/verifications/:id/approve', requireUser, requireModerator, async (req, res) => {
    res.json({ verification: serializeModVerification(await approveVerification(req.user!, String(req.params.id))) });
  });

  router.post('/mod/verifications/:id/reject', requireUser, requireModerator, validateBody(moderationRejectSchema), async (req, res) => {
    res.json({ verification: serializeModVerification(await rejectVerification(req.user!, String(req.params.id), (req.body as { reason: string }).reason)) });
  });

  router.get('/mod/tasks', requireUser, requireModerator, validateQuery(modTasksQuerySchema), async (req, res) => {
    const rows = await getTaskQueue(req.user!, parsedQuery<ModTasksQuery>(res).status);
    res.json({ items: rows.map(serializeModTask) });
  });

  router.post('/mod/tasks/:id/publish', requireUser, requireModerator, async (req, res) => {
    res.json({ task: serializeModTask(await publishTaskByModerator(req.user!, String(req.params.id))) });
  });

  router.post('/mod/tasks/:id/reject', requireUser, requireModerator, validateBody(moderationRejectSchema), async (req, res) => {
    res.json({ task: serializeModTask(await rejectTaskByModerator(req.user!, String(req.params.id), (req.body as { reason: string }).reason)) });
  });

  return router;
}
