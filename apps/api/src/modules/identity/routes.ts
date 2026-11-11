import {
  confirmEmailSchema,
  loginSchema,
  putSkillsSchema,
  registerSchema,
  resendConfirmationSchema,
  updateProfileSchema,
} from '@ctoc/shared';
import { Router } from 'express';
import { requireUser, SESSION_COOKIE } from '../../http/auth';
import { failureLimiter, rateLimit } from '../../http/rate-limit';
import { validateBody } from '../../http/validate';
import { ApiError } from '../../errors';
import { serializeConfirmed, serializeMe, serializePublicProfile, serializeRegistered } from './serializer';
import { confirmEmail, getPublicProfile, login, register, resendConfirmation, setMyBio, setMySkills, suggestSkills } from './service';

export function identityRouter(): Router {
  const router = Router();
  // 10 sign-ups per hour per IP (proposal; api.md §1 lists 429 for register).
  router.post('/auth/register', rateLimit({ max: 10, windowMs: 3600_000 }), validateBody(registerSchema), async (req, res) => {
    const user = await register(req.body);
    res.status(201).json(serializeRegistered(user));
  });

  router.post('/auth/confirm-email', validateBody(confirmEmailSchema), async (req, res) => {
    const user = await confirmEmail(req.body.token);
    res.status(200).json(serializeConfirmed(user));
  });

  // 5 resends per hour per IP (proposal).
  router.post('/auth/resend-confirmation', rateLimit({ max: 5, windowMs: 3600_000 }), validateBody(resendConfirmationSchema), async (req, res) => {
    await resendConfirmation(req.body.email);
    res.status(202).end();
  });

  // 5 failed logins per 15 minutes per IP (proposal, US-45/S3). Successful logins are not counted.
  const loginFailures = failureLimiter({ max: 5, windowMs: 15 * 60_000 });
  router.post('/auth/login', loginFailures.check, validateBody(loginSchema), async (req, res) => {
    try {
      const { user, sessionId, maxAgeMs } = await login(req.body.email, req.body.password);
      loginFailures.reset(req);
      res.cookie(SESSION_COOKIE, sessionId, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: maxAgeMs,
      });
      res.status(200).json(serializeMe(user));
    } catch (error) {
      if (error instanceof ApiError && error.code === 'INVALID_CREDENTIALS') loginFailures.fail(req);
      throw error;
    }
  });

  router.get('/me', requireUser, (req, res) => {
    res.json(serializeMe(req.user!));
  });

  // Public (A-16). no-store: a badge granted by a moderator must show on the next request (US-09/S3).
  router.get('/profiles/:userId', async (req, res) => {
    const { user, skills, bio } = await getPublicProfile(req.params.userId);
    res.setHeader('Cache-Control', 'no-store');
    res.json(serializePublicProfile(user, skills, bio));
  });

  // US-11. Unknown keys are stripped by the shared schema.
  router.put('/me/profile', requireUser, validateBody(updateProfileSchema), async (req, res) => {
    res.json({ bio: await setMyBio(req.user!, req.body.bio) });
  });

  // US-10. The body is replaced as a whole; unknown keys are stripped by the shared schema.
  router.put('/me/skills', requireUser, validateBody(putSkillsSchema), async (req, res) => {
    res.json({ skills: await setMySkills(req.user!, req.body.skills) });
  });

  router.get('/skills', requireUser, async (req, res) => {
    const query = typeof req.query.query === 'string' ? req.query.query.slice(0, 40) : '';
    res.json({ skills: await suggestSkills(query) });
  });
  return router;
}
