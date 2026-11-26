import { LIMITS } from '@ctoc/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../helpers/app';
import { prisma, resetDb } from '../helpers/db';
import { createLoggedInUser, createTask } from '../helpers/factories';

/**
 * US-03: the commission is public before sign-up and the moderator can change it, api.md §4.1e.
 * `GET /api/public/settings`, `GET` and `PUT /api/mod/settings`. A new rate applies to tasks published afterwards (INV-08).
 */

const ORIGIN = 'http://localhost:5173';
type Login = Awaited<ReturnType<typeof createLoggedInUser>>;

const withCookie = <T extends { set: (k: string, v: string) => T }>(req: T, cookie?: string) => (cookie ? req.set('Cookie', cookie) : req);
const publicSettings = () => api().get('/api/public/settings');
const modSettings = (cookie?: string) => withCookie(api().get('/api/mod/settings'), cookie);
const putSettings = (body: unknown, cookie?: string) => withCookie(api().put('/api/mod/settings').set('Origin', ORIGIN), cookie).send(body as object);
const publishTask = (id: string, cookie: string) => withCookie(api().post(`/api/mod/tasks/${id}/publish`).set('Origin', ORIGIN), cookie);

let moderator: Login;
let customer: Login;
let student: Login;

beforeEach(async () => {
  await resetDb();
  moderator = await createLoggedInUser('moderator');
  customer = await createLoggedInUser('customer');
  student = await createLoggedInUser('student');
});
afterEach(() => vi.restoreAllMocks());

describe('US-03 sc.1 the commission is public', () => {
  it('US-03 sc.1 a visitor without a session gets the rate: 200, an integer in basis points, no cache', async () => {
    const res = await publicSettings();

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toEqual({ commissionBp: LIMITS.commissionBp.default });
  });

  it('US-03 sc.1 the public body holds only the rate, nothing about who changed it', async () => {
    await putSettings({ commissionBp: 1200 }, moderator.cookie);

    const res = await publicSettings();

    expect(Object.keys(res.body)).toEqual(['commissionBp']);
  });
});

describe('US-03 sc.3 the moderator changes the commission', () => {
  it('US-03 sc.3 after the PUT the next public GET shows the new value, with no-store', async () => {
    const put = await putSettings({ commissionBp: 1500 }, moderator.cookie);

    expect(put.status).toBe(200);
    expect(put.body).toEqual({ commissionBp: 1500 });
    const res = await publicSettings();
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toEqual({ commissionBp: 1500 });
    expect((await modSettings(moderator.cookie)).body).toEqual({ commissionBp: 1500 });
  });

  it('US-03 sc.3 the change is audited with who and from → to, in one row of the settings table', async () => {
    await putSettings({ commissionBp: 1500 }, moderator.cookie);
    await putSettings({ commissionBp: 700 }, moderator.cookie);

    const rows = await prisma.setting.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ key: 'commission_bp', value: 700, updatedBy: moderator.user.id });
    const events = await prisma.auditEvent.findMany({ where: { entity: 'setting' }, orderBy: { createdAt: 'asc' } });
    expect(events.map((e) => JSON.parse(e.dataJson))).toEqual([
      { from: null, to: 1500 },
      { from: 1500, to: 700 },
    ]);
    expect(events.every((e) => e.actorId === moderator.user.id && e.action === 'settings.update')).toBe(true);
  });

  it('US-03 sc.3 both ends of the range are accepted', async () => {
    for (const commissionBp of [LIMITS.commissionBp.min, LIMITS.commissionBp.max]) {
      expect((await putSettings({ commissionBp }, moderator.cookie)).status).toBe(200);
      expect((await publicSettings()).body).toEqual({ commissionBp });
    }
  });

  it.each([[-1], [5001], [10.5], ['1000'], [null]])('US-03 sc.3 the rate %j is 400 VALIDATION_FAILED and nothing changes', async (commissionBp) => {
    await putSettings({ commissionBp: 1500 }, moderator.cookie);

    const res = await putSettings({ commissionBp }, moderator.cookie);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect((await publicSettings()).body).toEqual({ commissionBp: 1500 });
    expect(await prisma.auditEvent.count({ where: { entity: 'setting' } })).toBe(1);
  });

  it('US-03 sc.3 an empty body is 400 VALIDATION_FAILED', async () => {
    const res = await putSettings({}, moderator.cookie);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(await prisma.setting.count()).toBe(0);
  });

  it('US-03 sc.3 any other key is ignored: no other setting is written', async () => {
    const res = await putSettings({ commissionBp: 900, min_price_kopecks: 1, max_price_kopecks: 2, key: 'x' }, moderator.cookie);

    expect(res.status).toBe(200);
    expect((await prisma.setting.findMany()).map((s) => s.key)).toEqual(['commission_bp']);
  });

  it('US-03 sc.3 a stored value outside the range is never shown: 500 INTERNAL_ERROR, logged', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await prisma.setting.create({ data: { key: 'commission_bp', value: 9_999 } });

    const res = await publicSettings();

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
  });
});

describe('US-03 access to the settings of the moderator (INV-25, ADR-0006)', () => {
  it('US-03 without a session GET and PUT are 401 AUTH_REQUIRED', async () => {
    expect((await modSettings()).status).toBe(401);
    const put = await putSettings({ commissionBp: 1500 });
    expect(put.status).toBe(401);
    expect(put.body.error.code).toBe('AUTH_REQUIRED');
  });

  it.each(['student', 'customer'] as const)('US-03 sc.3 a %s cannot read or change the rate: 403 ROLE_FORBIDDEN, nothing written', async (role) => {
    const login = role === 'student' ? student : customer;

    const get = await modSettings(login.cookie);
    const put = await putSettings({ commissionBp: 1 }, login.cookie);

    expect(get.status).toBe(403);
    expect(get.body.error.code).toBe('ROLE_FORBIDDEN');
    expect(put.status).toBe(403);
    expect(put.body.error.code).toBe('ROLE_FORBIDDEN');
    expect(await prisma.setting.count()).toBe(0);
    expect(await prisma.auditEvent.count()).toBe(0);
  });

  it('US-03 the role is checked before the body: a bad body from a student is 403, not 400', async () => {
    const res = await putSettings({ commissionBp: -5 }, student.cookie);

    expect(res.status).toBe(403);
  });

  it('US-03 a PUT from another origin is 403 ORIGIN_MISMATCH and changes nothing (CSRF, ADR-0006)', async () => {
    const res = await api().put('/api/mod/settings').set('Cookie', moderator.cookie).set('Origin', 'http://evil.example').send({ commissionBp: 1 });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ORIGIN_MISMATCH');
    expect(await prisma.setting.count()).toBe(0);
  });
});

describe('US-03 sc.3 and INV-08: the new rate is for the tasks published afterwards', () => {
  it('US-03 sc.3 a task published before the change keeps its snapshot; one published after gets the new rate', async () => {
    const before = await createTask(customer.user.id, { priceKopecks: 100_000, status: 'pending_moderation' });
    const after = await createTask(customer.user.id, { priceKopecks: 100_000, status: 'pending_moderation' });
    expect((await publishTask(before.id, moderator.cookie)).status).toBe(200);

    await putSettings({ commissionBp: 2000 }, moderator.cookie);
    expect((await publishTask(after.id, moderator.cookie)).status).toBe(200);

    const rows = await prisma.task.findMany({ where: { id: { in: [before.id, after.id] } } });
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(byId[before.id]).toMatchObject({ commissionBp: 1000, commissionKopecks: 10_000, netKopecks: 90_000 });
    expect(byId[after.id]).toMatchObject({ commissionBp: 2000, commissionKopecks: 20_000, netKopecks: 80_000 });
  });
});
