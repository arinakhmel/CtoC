import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';

describe('ADR-0009: the API serves the built web app', () => {
  let dist: string;

  beforeAll(() => {
    dist = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-web-'));
    fs.mkdirSync(path.join(dist, 'assets'));
    fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html><html><body><div id="root"></div></body></html>');
    fs.writeFileSync(path.join(dist, 'assets', 'app.js'), 'console.log(1);');
  });

  afterAll(() => {
    fs.rmSync(dist, { recursive: true, force: true });
  });

  const web = () => supertest(createApp({ webDist: dist }));

  it('/ and /feed answer the HTML shell with no-store', async () => {
    for (const url of ['/', '/feed']) {
      const res = await web().get(url);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.text).toContain('id="root"');
    }
  });

  it('files under /assets are cached long, a missing asset is a JSON 404', async () => {
    const ok = await web().get('/assets/app.js');
    expect(ok.status).toBe(200);
    expect(ok.headers['cache-control']).toContain('immutable');
    const missing = await web().get('/assets/missing.js');
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('NOT_FOUND');
  });

  it('an unknown /api/* route keeps the JSON 404 envelope', async () => {
    const res = await web().get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Не знайдено' } });
  });

  it('/api/health and /healthz still answer ok', async () => {
    expect((await web().get('/api/health')).body).toEqual({ status: 'ok' });
    expect((await web().get('/healthz')).body).toEqual({ status: 'ok' });
  });
});

describe('ADR-0009: a missing web build', () => {
  let missing: string;

  beforeAll(() => {
    missing = fs.mkdtempSync(path.join(os.tmpdir(), 'ctoc-empty-dist-')); // exists, but has no index.html
  });

  afterAll(() => {
    fs.rmSync(missing, { recursive: true, force: true });
  });

  it('the app starts, warns and serves only the API', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const app = createApp({ webDist: missing });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
    expect((await supertest(app).get('/api/health')).status).toBe(200);
    expect((await supertest(app).get('/feed')).status).toBe(404);
  });

  it('in production the app refuses to start', () => {
    vi.stubEnv('NODE_ENV', 'production');
    try {
      expect(() => createApp({ webDist: missing })).toThrow(/Built web app not found/);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
