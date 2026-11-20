import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hashSessionId } from '../../src/modules/identity/domain';
import { prisma as appPrisma } from '../../src/platform/db';
import { getFileStorage } from '../../src/platform/ports/file-storage';
import { getMailer, setMailer, type Email, type Mailer } from '../../src/platform/ports/mailer';
import { api } from '../helpers/app';
import { prisma, resetDb } from '../helpers/db';

/**
 * US-39: the moderator's web queue of student documents, api.md §4.8b. `GET /api/mod/verifications`, `POST …/:id/approve` and
 * `/reject`. One decision for two entrances (web and Telegram): the first wins (INV-04, INV-24), the badge is set only by it (INV-03).
 */

const ORIGIN = 'http://localhost:5173';
let counter = 0;
async function loginAs(role: 'student' | 'customer' | 'moderator', overrides: Record<string, unknown> = {}) {
  counter += 1;
  const user = await prisma.user.create({
    data: {
      email: `modv${counter}@${role === 'student' ? 'university.edu.ua' : 'ctoc.local'}`,
      passwordHash: 'x',
      displayName: `Користувач ${counter}`,
      role,
      emailConfirmedAt: new Date(),
      ...overrides,
    },
  });
  const sid = `modv-session-${counter}`;
  await prisma.session.create({ data: { id: hashSessionId(sid), userId: user.id, expiresAt: new Date(Date.now() + 3600_000) } });
  return { user, cookie: `sid=${sid}` };
}
type Login = Awaited<ReturnType<typeof loginAs>>;

const withCookie = <T extends { set: (k: string, v: string) => T }>(req: T, cookie?: string) => (cookie ? req.set('Cookie', cookie) : req);
const queue = (cookie?: string, status?: string) => withCookie(api().get(`/api/mod/verifications${status ? `?status=${status}` : ''}`), cookie);
const approve = (id: string, cookie?: string) => withCookie(api().post(`/api/mod/verifications/${id}/approve`).set('Origin', ORIGIN), cookie);
const reject = (id: string, body: unknown, cookie?: string) => withCookie(api().post(`/api/mod/verifications/${id}/reject`).set('Origin', ORIGIN), cookie).send(body as object);
const notificationsOf = (cookie: string) => api().get('/api/me/notifications').set('Cookie', cookie);

let moderator: Login;
let sent: Email[];
let previousMailer: Mailer;

/** A student with a stored document and a pending request, as after the upload of US-08. */
async function studentWithRequest(overrides: Record<string, unknown> = {}) {
  const student = await loginAs('student', overrides);
  const request = await addRequest(student.user.id);
  return { student, request };
}
async function addRequest(userId: string, status = 'pending') {
  const key = `key-${Math.random()}`;
  const file = await prisma.file.create({
    data: { ownerId: userId, kind: 'student_document', storageKey: key, originalName: 'квиток.pdf', mime: 'application/pdf', sizeBytes: 10, sha256: 'x' },
  });
  await getFileStorage().put(key, Buffer.from('%PDF-1.4 test'));
  return prisma.verificationRequest.create({ data: { userId, fileId: file.id, status } });
}
const verifiedAt = async (userId: string) => (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).studentVerifiedAt;
const auditCount = () => prisma.auditEvent.count({ where: { action: { startsWith: 'verification.' } } });

beforeEach(async () => {
  await resetDb();
  rmSync(resolve(process.cwd(), 'data/test-uploads'), { recursive: true, force: true });
  moderator = await loginAs('moderator');
  sent = [];
  previousMailer = getMailer();
  setMailer({ send: async (email) => void sent.push(email) });
});
afterEach(() => {
  setMailer(previousMailer);
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('GET /api/mod/verifications', () => {
  it('lists pending requests oldest first with the student, the file and the status (default pending)', async () => {
    const first = await studentWithRequest();
    await new Promise((r) => setTimeout(r, 5));
    const second = await studentWithRequest();
    await addRequest((await loginAs('student')).user.id, 'approved');

    const res = await queue(moderator.cookie);

    expect(res.status).toBe(200);
    expect(res.body.items.map((i: { id: string }) => i.id)).toEqual([first.request.id, second.request.id]);
    expect(res.body.items[0]).toEqual({
      id: first.request.id,
      student: { id: first.student.user.id, displayName: first.student.user.displayName, email: first.student.user.email },
      file: { id: first.request.fileId, originalName: 'квиток.pdf', mime: 'application/pdf', sizeBytes: 10 },
      status: 'pending',
      reason: null,
      createdAt: expect.any(String),
      decidedAt: null,
    });
    expect((await queue(moderator.cookie, 'approved')).body.items).toHaveLength(1);
  });

  it('a bad status is 400 VALIDATION_FAILED', async () => {
    const res = await queue(moderator.cookie, 'revoked');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });
});

describe('US-39 scenarios', () => {
  it('US-39 sc.1 the moderator approves: 200, approved, the badge, the audit with the moderator, the student reads the notification; others get nothing', async () => {
    const { student, request } = await studentWithRequest();
    const other = await loginAs('student');
    const customer = await loginAs('customer');

    const res = await approve(request.id, moderator.cookie);

    expect(res.status).toBe(200);
    expect(res.body.verification).toMatchObject({ id: request.id, status: 'approved', reason: null, student: { id: student.user.id } });
    const stored = await prisma.verificationRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(stored).toMatchObject({ status: 'approved', decidedBy: moderator.user.id });
    expect(stored.decidedAt).not.toBeNull();
    expect(await verifiedAt(student.user.id)).not.toBeNull();
    expect((await api().get(`/api/profiles/${student.user.id}`)).body.profile.verified).toBe(true);
    const audit = await prisma.auditEvent.findFirstOrThrow({ where: { action: 'verification.approved' } });
    expect(audit.actorId).toBe(moderator.user.id);
    expect(JSON.parse(audit.dataJson)).toMatchObject({ via: 'web' });
    const notes = (await notificationsOf(student.cookie)).body.notifications;
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ type: 'verification_approved', read: false });
    expect(notes[0].text).toContain('підтверджено');
    expect(await verifiedAt(other.user.id)).toBeNull();
    expect(await verifiedAt(customer.user.id)).toBeNull();
    expect(sent.map((e) => e.to)).toEqual([student.user.email]);
  });

  it('US-39 sc.2 reject with a reason: 200, no badge, the student reads the reason, the mailer got a letter; no reason or spaces is 400 REASON_REQUIRED and nothing changes', async () => {
    const { student, request } = await studentWithRequest();

    for (const body of [{}, { reason: '' }, { reason: '   ' }]) {
      const bad = await reject(request.id, body, moderator.cookie);
      expect(bad.status).toBe(400);
      expect(bad.body.error.code).toBe('REASON_REQUIRED');
    }
    expect((await prisma.verificationRequest.findUniqueOrThrow({ where: { id: request.id } })).status).toBe('pending');
    expect(await appPrisma.notification.count()).toBe(0);
    expect(await auditCount()).toBe(0);

    const res = await reject(request.id, { reason: 'Фото нечитабельне' }, moderator.cookie);

    expect(res.status).toBe(200);
    expect(res.body.verification).toMatchObject({ status: 'rejected', reason: 'Фото нечитабельне' });
    expect(await verifiedAt(student.user.id)).toBeNull();
    const notes = (await notificationsOf(student.cookie)).body.notifications;
    expect(notes[0]).toMatchObject({ type: 'verification_rejected' });
    expect(notes[0].text).toContain('Фото нечитабельне');
    expect(notes[0].text).not.toBe('Нове сповіщення');
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe(student.user.email);
    expect(sent[0]!.text).toContain('Фото нечитабельне');
  });

  it('US-39 sc.3 a student is 403 ROLE_FORBIDDEN on the list and both decisions, even with an invalid body; a customer is 403; no session is 401', async () => {
    const { request } = await studentWithRequest();
    const student = await loginAs('student');
    const customer = await loginAs('customer');

    for (const who of [student, customer]) {
      for (const res of [await queue(who.cookie), await approve(request.id, who.cookie), await reject(request.id, {}, who.cookie), await reject(request.id, { reason: 'x' }, who.cookie)]) {
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('ROLE_FORBIDDEN');
      }
    }
    for (const res of [await queue(), await approve(request.id), await reject(request.id, { reason: 'x' })]) {
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_REQUIRED');
    }
    expect((await prisma.verificationRequest.findUniqueOrThrow({ where: { id: request.id } })).status).toBe('pending');
  });

  it('an unknown id is 404 NOT_FOUND', async () => {
    const res = await approve('00000000-0000-4000-8000-000000000000', moderator.cookie);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('Races and rollback (ADR-0007, INV-04, INV-24)', () => {
  it('two approves at once: exactly one 200, the other 409 ALREADY_DECIDED, one audit event', async () => {
    const { student, request } = await studentWithRequest();
    const results = await Promise.all([approve(request.id, moderator.cookie), approve(request.id, moderator.cookie)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(results.find((r) => r.status === 409)!.body.error.code).toBe('ALREADY_DECIDED');
    expect(await auditCount()).toBe(1);
    expect(await verifiedAt(student.user.id)).not.toBeNull();
  });

  it('approve and reject at once: exactly one wins and the other is 409 ALREADY_DECIDED', async () => {
    const { student, request } = await studentWithRequest();
    const results = await Promise.all([approve(request.id, moderator.cookie), reject(request.id, { reason: 'Підробка' }, moderator.cookie)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await auditCount()).toBe(1);
    const stored = await prisma.verificationRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(stored.status === 'approved').toBe((await verifiedAt(student.user.id)) !== null);
  });

  it('a stale id: request A was rejected and the student sent a new document B; a decision on A is 409 and B stays pending, no badge', async () => {
    const { student, request: a } = await studentWithRequest();
    await prisma.verificationRequest.update({ where: { id: a.id }, data: { status: 'rejected', reason: 'Старий' } });
    const b = await addRequest(student.user.id);

    for (const res of [await approve(a.id, moderator.cookie), await reject(a.id, { reason: 'Ще раз' }, moderator.cookie)]) {
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('ALREADY_DECIDED');
    }
    expect((await prisma.verificationRequest.findUniqueOrThrow({ where: { id: b.id } })).status).toBe('pending');
    expect(await verifiedAt(student.user.id)).toBeNull();
    expect(await auditCount()).toBe(0);
  });

  it('rollback: a failure at the notification insert is 500 INTERNAL_ERROR; the request stays pending, no badge, no notification, no audit', async () => {
    const { student, request } = await studentWithRequest();
    const original = appPrisma.$transaction;
    appPrisma.$transaction = ((fn: (tx: object) => unknown, options?: unknown) =>
      (original as (...a: unknown[]) => unknown).call(
        appPrisma,
        (tx: object) =>
          fn(
            new Proxy(tx, {
              get(target, prop) {
                if (prop === 'notification') return { create: () => Promise.reject(new Error('injected failure')) };
                return Reflect.get(target, prop, target);
              },
            }),
          ),
        options,
      )) as never;
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let res;
    try {
      res = await approve(request.id, moderator.cookie);
    } finally {
      appPrisma.$transaction = original;
      consoleError.mockRestore();
    }

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect((await prisma.verificationRequest.findUniqueOrThrow({ where: { id: request.id } })).status).toBe('pending');
    expect(await verifiedAt(student.user.id)).toBeNull();
    expect(await prisma.notification.count()).toBe(0);
    expect(await auditCount()).toBe(0);
    expect(sent).toHaveLength(0);
  });

  it('a Telegram click after a web decision is «Already decided» and changes nothing', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', '123:test-token');
    vi.stubEnv('TELEGRAM_CHAT_ID', '-1001');
    vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', 's3cret');
    const answers: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        if (String(url).endsWith('answerCallbackQuery')) answers.push(String(JSON.parse(String(init.body)).text));
        return new Response(JSON.stringify({ ok: true, result: true }), { status: 200 });
      }),
    );
    const { student, request } = await studentWithRequest();
    expect((await reject(request.id, { reason: 'Підробка' }, moderator.cookie)).status).toBe(200);
    sent.length = 0;

    const res = await api()
      .post('/api/webhooks/telegram')
      .set('X-Telegram-Bot-Api-Secret-Token', 's3cret')
      .send({ callback_query: { id: 'c1', from: { id: 1, username: 'm' }, data: `verify:${request.id}`, message: { message_id: 1, chat: { id: -1001 }, caption: 'x' } } });

    expect(res.status).toBe(200);
    expect(answers).toEqual(['Already decided']);
    expect(await verifiedAt(student.user.id)).toBeNull();
    expect((await prisma.verificationRequest.findUniqueOrThrow({ where: { id: request.id } })).status).toBe('rejected');
    expect(sent).toHaveLength(0);
    expect(await auditCount()).toBe(1);
  });
});

describe('GET /api/files/:fileId for a moderator (OQ-43 a)', () => {
  it('a moderator downloads a student document: 200 attachment', async () => {
    const { request } = await studentWithRequest();
    const res = await api().get(`/api/files/${request.fileId}`).set('Cookie', moderator.cookie);
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain('attachment');
  });

  it('a result file is 403 FILE_FORBIDDEN for a moderator', async () => {
    const student = await loginAs('student');
    const file = await prisma.file.create({
      data: { ownerId: student.user.id, kind: 'result', storageKey: 'result-key', originalName: 'r.pdf', mime: 'application/pdf', sizeBytes: 5, sha256: 'x' },
    });
    const res = await api().get(`/api/files/${file.id}`).set('Cookie', moderator.cookie);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FILE_FORBIDDEN');
  });
});
