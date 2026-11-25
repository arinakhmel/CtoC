import { Router } from 'express';
import { getCommissionBp } from './service';
import { serializeSettings } from './serializer';

/** US-03 sc.1, sc.3: what a visitor may know. Public, never cached, so a changed rate shows on the next load (api.md §4.1e). */
export function settingsRouter(): Router {
  const router = Router();

  router.get('/public/settings', async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(serializeSettings(await getCommissionBp()));
  });

  return router;
}
