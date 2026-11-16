import { Router } from 'express';
import { applicationsRouter } from './applications/routes';
import { chatRouter } from './chat/routes';
import { devRouter } from './dev/routes';
import { identityRouter } from './identity/routes';
import { notificationsRouter } from './notifications/routes';
import { paymentsRouter } from './payments/routes';
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
  router.use(applicationsRouter());
  router.use(notificationsRouter());
  router.use(chatRouter());
  router.use(paymentsRouter());
  router.use(devRouter());
  return router;
}
