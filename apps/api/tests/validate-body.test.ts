import express from 'express';
import supertest from 'supertest';
import { createTaskSchema, returnForRevisionSchema, registerSchema } from '@ctoc/shared';
import { describe, expect, it } from 'vitest';
import { errorHandler } from '../src/http/error-handler';
import { validateBody } from '../src/http/validate';
import type { ZodTypeAny } from 'zod';

/** A tiny app: the route echoes `req.body`, so we can see what the middleware left in it. */
const appWith = (schema: ZodTypeAny) => {
  const app = express();
  app.use(express.json());
  app.post('/echo', validateBody(schema), (req, res) => {
    res.json({ received: req.body });
  });
  app.use(errorHandler);
  return supertest(app);
};

const inOneWeek = () => new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();

describe('api.md §Conventions: validateBody replaces the body with the parsed value', () => {
  it('normalises values (US-06 sc.1: the email is lower-cased and trimmed)', async () => {
    const res = await appWith(registerSchema)
      .post('/echo')
      .send({ role: 'student', email: '  User@University.EDU.UA ', displayName: 'Олена', password: 'secret-pass' });
    expect(res.status).toBe(200);
    expect(res.body.received.email).toBe('user@university.edu.ua');
  });

  it('strips unknown keys (US-42 sc.2, US-40 sc.3: a forged price or status never reaches the service)', async () => {
    const res = await appWith(createTaskSchema)
      .post('/echo')
      .send({ title: 'Парсер сайту', description: 'Опис', priceKopecks: 40_000, deadlineAt: inOneWeek(), status: 'published', executorId: 'x' });
    expect(res.status).toBe(200);
    expect(Object.keys(res.body.received).sort()).toEqual(['deadlineAt', 'description', 'priceKopecks', 'title']);
  });

  it('treats a missing body as an empty object', async () => {
    const res = await appWith(returnForRevisionSchema).post('/echo');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('COMMENT_REQUIRED');
  });
});

describe('api.md §2: validation errors carry details per field', () => {
  it('US-16 sc.2, sc.3 and US-17 sc.2: several invalid fields give VALIDATION_FAILED with one detail each', async () => {
    const res = await appWith(createTaskSchema)
      .post('/echo')
      .send({ title: 'A', description: '', priceKopecks: 2_000, deadlineAt: inOneWeek() });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.details).toEqual([
      { field: 'title', code: 'TITLE_TOO_SHORT' },
      { field: 'description', code: 'VALIDATION_FAILED' },
      { field: 'priceKopecks', code: 'PRICE_BELOW_MIN' },
    ]);
  });

  it('US-33 sc.2: a single specific problem is reported with its own top-level code', async () => {
    const res = await appWith(returnForRevisionSchema).post('/echo').send({ comment: '' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({
      code: 'COMMENT_REQUIRED',
      message: "Коментар до доопрацювання є обов'язковим",
      details: [{ field: 'comment', code: 'COMMENT_REQUIRED' }],
    });
  });

  it('US-06 sc.2: EMAIL_DOMAIN_NOT_ALLOWED is reported on the email field', async () => {
    const res = await appWith(registerSchema)
      .post('/echo')
      .send({ role: 'student', email: 'test@gmail.com', displayName: 'Test User', password: 'secret-pass' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('EMAIL_DOMAIN_NOT_ALLOWED');
    expect(res.body.error.details).toEqual([{ field: 'email', code: 'EMAIL_DOMAIN_NOT_ALLOWED' }]);
  });

  it('a schema message that is not an error code becomes VALIDATION_FAILED', async () => {
    const res = await appWith(registerSchema).post('/echo').send({ role: 'student' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.details.length).toBeGreaterThan(0);
    for (const detail of res.body.error.details) expect(detail.code).toBe('VALIDATION_FAILED');
  });
});
