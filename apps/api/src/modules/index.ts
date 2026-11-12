import { Router } from 'express';
import { devRouter } from './dev/routes';
import { identityRouter } from './identity/routes';
import { tasksRouter } from './tasks/routes';
import { verificationRouter } from './verification/routes';

/**
 * Mounted at /api by app.ts. Each feature module adds its router here.
 * A function, so every app instance (and every test) gets fresh in-memory rate limiters.
 * See README.md in this folder.
 */
export function createModulesRouter(): Router {
  const router = Router();
  router.use(identityRouter());
  router.use(verificationRouter());
  router.use(tasksRouter());
  router.use(devRouter());
  return router;
}
