import {
  assignExecutorSchema,
  createApplicationSchema,
  idempotencyKeySchema,
  type AssignExecutorInput,
  type CreateApplicationInput,
} from '@ctoc/shared';
import { Router, type RequestHandler } from 'express';
import { ApiError } from '../../errors';
import { requireUser } from '../../http/auth';
import { validateBody } from '../../http/validate';
import { assertCanApply, assertCanListCandidates, assertCanReadMyApplications } from './policy';
import { serializeApplication, serializeAssignment, serializeCandidate, serializeMyApplication, serializeOwnerTask } from './serializer';
import { assignExecutor, createApplication, deleteMyTask, getCandidates, getMyApplications, resolveOwnedTask, type OwnedTask } from './service';

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

/** US-25. The owner's task as a step of its own, so access (403, 404) is checked before the body (403 before 400). */
const requireOwnedTask: RequestHandler = async (req, res, next) => {
  res.locals.ownedTask = await resolveOwnedTask(req.user!, String(req.params.id));
  next();
};

/** US-26. The optional Idempotency-Key header: absent is fine, present must be a plausible key (400 VALIDATION_FAILED). */
function readIdempotencyKey(header: string | undefined): string | undefined {
  if (header === undefined) return undefined;
  const parsed = idempotencyKeySchema.safeParse(header);
  if (!parsed.success) throw new ApiError('VALIDATION_FAILED', { details: [{ field: 'Idempotency-Key', code: 'VALIDATION_FAILED' }] });
  return parsed.data;
}

export function applicationsRouter(): Router {
  const router = Router();

  router.get('/me/applications', requireUser, requireReadAccess, async (req, res) => {
    const applications = await getMyApplications(req.user!);
    res.json({ applications: applications.map(serializeMyApplication) });
  });

  router.get('/tasks/:id/applications', requireUser, requireOwnerAccess, async (req, res) => {
    const { task, candidates, truncated } = await getCandidates(req.user!, String(req.params.id));
    res.json({ task: serializeOwnerTask(task), applications: candidates.map(({ row, student }) => serializeCandidate(row, student)), truncated });
  });

  // US-22 sc.2, US-50 sc.3. Access "Own": a customer with a confirmed email (the same rule as the candidate list).
  router.delete('/tasks/:id', requireUser, requireOwnerAccess, async (req, res) => {
    await deleteMyTask(req.user!, String(req.params.id));
    res.status(204).end();
  });

  router.post('/tasks/:id/assign', requireUser, requireOwnedTask, validateBody(assignExecutorSchema), async (req, res) => {
    const key = readIdempotencyKey(req.get('Idempotency-Key'));
    const result = await assignExecutor(req.user!, res.locals.ownedTask as OwnedTask, req.body as AssignExecutorInput, key);
    res.json(serializeAssignment(result));
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
