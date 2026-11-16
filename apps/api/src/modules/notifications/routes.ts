import { notificationsQuerySchema, type NotificationsQuery } from '@ctoc/shared';
import { Router } from 'express';
import { requireUser } from '../../http/auth';
import { parsedQuery, validateQuery } from '../../http/validate';
import { serializeNotification } from './serializer';
import { getMyNotifications, markMyNotificationRead } from './service';

/** Access "A" of api.md: any logged-in user, so `requireUser` is the access check. The queries are scoped to the caller. */
export function notificationsRouter(): Router {
  const router = Router();

  router.get('/me/notifications', requireUser, validateQuery(notificationsQuerySchema), async (req, res) => {
    const notifications = await getMyNotifications(req.user!, parsedQuery<NotificationsQuery>(res));
    res.json({ notifications: notifications.map(serializeNotification) });
  });

  router.post('/me/notifications/:id/read', requireUser, async (req, res) => {
    await markMyNotificationRead(req.user!, String(req.params.id));
    res.status(204).end();
  });

  return router;
}
