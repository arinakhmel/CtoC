import fs from 'node:fs';
import path from 'node:path';
import express, { type Express, type RequestHandler } from 'express';
import { errorHandler, notFoundHandler } from './http/error-handler';
import { originCheck, sessionMiddleware } from './http/auth';
import { createModulesRouter } from './modules';

const health: RequestHandler = (_req, res) => {
  res.json({ status: 'ok' });
};

export interface AppOptions {
  /** Folder with the built web app. Default: WEB_DIST_PATH or ../web/dist relative to the working directory. */
  webDist?: string;
}

export function createApp(options: AppOptions = {}): Express {
  const dist = path.resolve(options.webDist ?? process.env.WEB_DIST_PATH ?? path.resolve(process.cwd(), '../web/dist'));
  const indexHtml = path.join(dist, 'index.html');
  const hasWeb = fs.existsSync(indexHtml);
  if (!hasWeb) {
    const message = `Built web app not found at ${indexHtml}; the SPA is not served (run "pnpm build")`;
    if (process.env.NODE_ENV === 'production') throw new Error(message);
    console.warn(message);
  }

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // behind the hosting platform's proxy (ADR-0009)

  app.get('/api/health', health);
  app.get('/healthz', health); // used by hosting platforms (ADR-0009)

  // Static files and the SPA fallback come before the session middleware: they never touch the database.
  if (hasWeb) {
    app.use(
      express.static(dist, {
        index: false,
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-store');
          else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          }
        },
      }),
    );
    // SPA fallback. '/{*splat}' (Express 5) also matches '/'. API and asset misses keep the JSON 404.
    app.get('/{*splat}', (req, res, next) => {
      if (req.path === '/api' || req.path.startsWith('/api/') || req.path.startsWith('/assets/')) {
        next();
        return;
      }
      res.setHeader('Cache-Control', 'no-store');
      res.sendFile(indexHtml);
    });
  }

  app.use(express.json({ limit: '100kb' }));
  app.use(sessionMiddleware);
  app.use(originCheck);
  app.use('/api', createModulesRouter());

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
