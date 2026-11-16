import { createApplicationSchema, type CreateApplicationInput } from '@ctoc/shared';
import { Router, type RequestHandler } from 'express';
import { requireUser } from '../../http/auth';
import { validateBody } from '../../http/validate';
import { assertCanApply, assertCanReadMyApplications } from './policy';
import { serializeApplication, serializeMyApplication } from './serializer';
import { createApplication, getMyApplications } from './service';

/** The access check as a step of its own, so it runs before the body is validated (403 before 400). */
const requireApplyAccess: RequestHandler = (req, _res, next) => {
  assertCanApply(req.user!);
  next();
};

const requireReadAccess: RequestHandler = (req, _res, next) => {
  assertCanReadMyApplications(req.user!);
  next();
};

export function applicationsRouter(): Router {
  const router = Router();

  router.get('/me/applications', requireUser, requireReadAccess, async (req, res) => {
    const applications = await getMyApplications(req.user!);
    res.json({ applications: applications.map(serializeMyApplication) });
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
