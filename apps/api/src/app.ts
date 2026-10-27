import express, { type Express, type RequestHandler } from 'express';
import { errorHandler, notFoundHandler } from './http/error-handler';
import { modulesRouter } from './modules';

const health: RequestHandler = (_req, res) => {
  res.json({ status: 'ok' });
};

export function createApp(): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', health);
  app.get('/healthz', health); // used by hosting platforms (ADR-0009)
  app.use('/api', modulesRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
