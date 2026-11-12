import { feedQuerySchema, type FeedQuery } from '@ctoc/shared';
import { Router, type RequestHandler } from 'express';
import { requireUser } from '../../http/auth';
import { parsedQuery, validateQuery } from '../../http/validate';
import { assertCanReadFeed } from './policy';
import { serializeFeedTask } from './serializer';
import { getFeed, getTask } from './service';

/** The access check as a step of its own, so it runs before the query is validated (403 before 400). */
const requireFeedAccess: RequestHandler = (req, _res, next) => {
  assertCanReadFeed(req.user!);
  next();
};

export function tasksRouter(): Router {
  const router = Router();

  router.get('/tasks', requireUser, requireFeedAccess, validateQuery(feedQuerySchema), async (req, res) => {
    const feed = await getFeed(req.user!, parsedQuery<FeedQuery>(res));
    res.json({ tasks: feed.tasks.map(serializeFeedTask), nextCursor: feed.nextCursor });
  });

  router.get('/tasks/:id', requireUser, requireFeedAccess, async (req, res) => {
    const task = await getTask(req.user!, String(req.params.id));
    res.json({ task: serializeFeedTask(task) });
  });

  return router;
}
