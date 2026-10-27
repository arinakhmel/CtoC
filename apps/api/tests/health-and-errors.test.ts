import express from 'express';
import supertest from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../src/errors';
import { errorHandler } from '../src/http/error-handler';
import { api } from './helpers/app';

describe('api.md §Conventions: health check', () => {
  it('GET /api/health answers 200 {"status":"ok"} without a session', async () => {
    const res = await api().get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('GET /healthz answers the same (ADR-0009, hosting health check)', async () => {
    const res = await api().get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

describe('api.md §2 error format', () => {
  it('an unknown route answers 404 NOT_FOUND with the Ukrainian default message', async () => {
    const res = await api().get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Не знайдено' } });
  });

  it('malformed JSON answers 400 VALIDATION_FAILED in the same format', async () => {
    const res = await api().post('/api/anything').set('Content-Type', 'application/json').send('{"broken": ');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(typeof res.body.error.message).toBe('string');
  });

  it('a JSON body over the size limit answers 400 VALIDATION_FAILED', async () => {
    const res = await api().post('/api/anything').send({ text: 'x'.repeat(200_000) });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });
});

describe('api.md §2 and ADR-0005: the central error handler', () => {
  const appThatThrows = (error: unknown) => {
    const app = express();
    app.get('/boom', () => {
      throw error;
    });
    app.use(errorHandler);
    return supertest(app);
  };

  it('an ApiError keeps its status, code and details', async () => {
    const res = await appThatThrows(
      new ApiError('PRICE_BELOW_MIN', { details: [{ field: 'priceKopecks', code: 'PRICE_BELOW_MIN' }] }),
    ).get('/boom');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: {
        code: 'PRICE_BELOW_MIN',
        message: 'Мінімальна вартість завдання — 50 грн',
        details: [{ field: 'priceKopecks', code: 'PRICE_BELOW_MIN' }],
      },
    });
  });

  it('US-21 sc.2, US-30 sc.2: an unexpected error answers 500 INTERNAL_ERROR and leaks nothing', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await appThatThrows(new Error('secret: connection string postgres://user:pass@host')).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(res.body)).not.toContain('secret');
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('every status in the dictionary maps to its code (api.md §3)', () => {
    expect(new ApiError('ALREADY_APPLIED').status).toBe(409);
    expect(new ApiError('AUTH_REQUIRED').status).toBe(401);
    expect(new ApiError('NOT_CHAT_PARTICIPANT').status).toBe(403);
    expect(new ApiError('INSUFFICIENT_FUNDS').status).toBe(422);
  });
});
