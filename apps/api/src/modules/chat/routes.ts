import { chatQuerySchema, createMessageSchema, type ChatQuery, type CreateMessageInput } from '@ctoc/shared';
import { Router, type RequestHandler } from 'express';
import { requireUser } from '../../http/auth';
import { parsedQuery, validateBody, validateQuery } from '../../http/validate';
import { serializeMessage } from './serializer';
import { getMessages, resolveChat, sendMessage, type ChatTask } from './service';

/** The access check as a step of its own, so it runs before the query or body is validated (403 before 400). */
const requireParticipant: RequestHandler = async (req, res, next) => {
  res.locals.chatTask = await resolveChat(req.user!, String(req.params.id));
  next();
};
const chatTaskOf = (res: { locals: Record<string, unknown> }) => res.locals.chatTask as ChatTask;

export function chatRouter(): Router {
  const router = Router();

  router.get('/tasks/:id/messages', requireUser, requireParticipant, validateQuery(chatQuerySchema), async (req, res) => {
    const task = chatTaskOf(res);
    const messages = await getMessages(task, parsedQuery<ChatQuery>(res));
    res.json({ messages: messages.map((message) => serializeMessage(message, task, req.user!.id)) });
  });

  router.post('/tasks/:id/messages', requireUser, requireParticipant, validateBody(createMessageSchema), async (req, res) => {
    const task = chatTaskOf(res);
    const message = await sendMessage(req.user!, task, req.body as CreateMessageInput);
    res.status(201).json({ message: serializeMessage(message, task, req.user!.id) });
  });

  return router;
}
