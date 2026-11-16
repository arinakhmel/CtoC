import { createApplicationSchema, type CreateApplicationInput } from '@ctoc/shared';
import { Router, type RequestHandler } from 'express';
import { requireUser } from '../../http/auth';
import { validateBody } from '../../http/validate';
import { assertCanApply, assertCanListCandidates, assertCanReadMyApplications } from './policy';
import { serializeApplication, serializeCandidate, serializeMyApplication, serializeOwnerTask } from './serializer';
import { createApplication, getCandidates, getMyApplications } from './service';

/** The access check as a step of its own, so it runs before the body is validated (403 before 400). */
const requireApplyAccess: RequestHandler = (req, _res, next) => {
  assertCanApply(req.user!);
  next();
};

const requireReadAccess: RequestHandler = (req, _res, next) => {
  assertCanReadMyApplications(req.user!);
  next();
};

const requireOwnerAccess: RequestHandler = (req, _res, next) => {
  assertCanListCandidates(req.user!);
  next();
};

export function applicationsRouter(): Router {
  const router = Router();

  router.get('/me/applications', requireUser, requireReadAccess, async (req, res) => {
    const applications = await getMyApplications(req.user!);
    res.json({ applications: applications.map(serializeMyApplication) });
  });

  router.get('/tasks/:id/applications', requireUser, requireOwnerAccess, async (req, res) => {
    const { task, candidates } = await getCandidates(req.user!, String(req.params.id));
    res.json({ task: serializeOwnerTask(task), applications: candidates.map(({ row, student }) => serializeCandidate(row, student)) });
  });

  router.post(
    '/tasks/:id/applications',
    requireUser,
    requireApplyAccess,
    validateBody(createApplicationSchema),
    async (req, res) => {
      const application = await createApplication(req.user!, String(req.params.id), req.body as CreateApplicationInput);
      res.status(201).json({ application: serializeApplication(application) });
    },
  );

  return router;
}
