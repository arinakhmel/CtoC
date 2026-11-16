import { createTaskSchema, feedQuerySchema, type CreateTaskInput, type FeedQuery } from '@ctoc/shared';
import { Router, type RequestHandler } from 'express';
import { requireUser } from '../../http/auth';
import { parsedQuery, validateBody, validateQuery } from '../../http/validate';
import { assertCanCreateTask, assertCanDeleteTask, assertCanListMyWork, assertCanReadFeed } from './policy';
import { serializeFeedTask, serializeOwnTask, serializeWorkTask } from './serializer';
import { createTask, deleteTask, getFeed, getMyWork, getTaskDetails } from './service';

/** The access check as a step of its own, so it runs before the query is validated (403 before 400). */
const requireFeedAccess: RequestHandler = (req, _res, next) => {
  assertCanReadFeed(req.user!);
  next();
};

const requireWorkAccess: RequestHandler = (req, _res, next) => {
  assertCanListMyWork(req.user!);
  next();
};

const requireDeleteAccess: RequestHandler = (req, _res, next) => {
  assertCanDeleteTask(req.user!);
  next();
};

const requireCreateAccess: RequestHandler = (req, _res, next) => {
  assertCanCreateTask(req.user!);
  next();
};

export function tasksRouter(): Router {
  const router = Router();

  router.get('/tasks', requireUser, requireFeedAccess, validateQuery(feedQuerySchema), async (req, res) => {
    const feed = await getFeed(req.user!, parsedQuery<FeedQuery>(res));
    res.json({ tasks: feed.tasks.map(serializeFeedTask), nextCursor: feed.nextCursor });
  });

  router.get('/tasks/:id', requireUser, requireFeedAccess, async (req, res) => {
    const { task, asExecutor } = await getTaskDetails(req.user!, String(req.params.id));
    res.json({ task: asExecutor ? serializeWorkTask(task) : serializeFeedTask(task) });
  });

  router.get('/me/work', requireUser, requireWorkAccess, async (req, res) => {
    const tasks = await getMyWork(req.user!);
    res.json({ tasks: tasks.map(serializeWorkTask) });
  });

  router.delete('/tasks/:id', requireUser, requireDeleteAccess, async (req, res) => {
    await deleteTask(req.user!, String(req.params.id));
    res.status(204).end();
  });

  router.post('/tasks', requireUser, requireCreateAccess, validateBody(createTaskSchema), async (req, res) => {
    const task = await createTask(req.user!, req.body as CreateTaskInput);
    res.status(201).json({ task: serializeOwnTask(task) });
  });

  return router;
}
