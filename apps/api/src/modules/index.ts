import { Router } from 'express';

/**
 * Mounted at /api by app.ts. Each feature module adds its router here, for example:
 *   router.use('/tasks', tasksRouter);
 * See README.md in this folder.
 */
export const modulesRouter = Router();
