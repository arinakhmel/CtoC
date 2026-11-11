import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hashSessionId } from '../../src/modules/identity/domain';
import { getMailer, setMailer, type Email, type Mailer } from '../../src/platform/ports/mailer';
import { api } from '../helpers/app';
import { createFile, createUser } from '../helpers/factories';
import { prisma, resetDb } from '../helpers/db';

const ORIGIN = 'http://localhost:5173';
const CHAT_ID = -1001234567890;
const SECRET = 'test-webhook-secret';
const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200)]);
const pdf = Buffer.concat([Buffer.from('%PDF-1.4'), Buffer.alloc(200)]);

interface TelegramCall {
  method: string;
  body: FormData | Record<string, unknown>;
}
let calls: TelegramCall[];
let sentEmails: Email[];
let previousMailer: Mailer;

/** Replaces the global fetch: records Telegram calls and answers `{ ok: true }`. Set `failWith` to simulate an outage. */
function stubTelegram(failWith?: number) {
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      const method = String(url).split('/').pop()!;
      calls.push({ method, body: init.body as FormData | Record<string, unknown> });
      if (failWith) return new Response(JSON.stringify({ ok: false, description: 'Bad Request' }), { status: failWith });
      return new Response(JSON.stringify({ ok: true, result: true }), { status: 200 });
    }),
  );
}
const jsonBody = (call: TelegramCall) => (typeof call.body === 'string' ? JSON.parse(call.body) : call.body) as Record<string, unknown>;
const callsTo = (method: string) => calls.filter((call) => call.method === method);

beforeEach(async () => {
  await resetDb();
  vi.stubEnv('TELEGRAM_BOT_TOKEN', '123:test-token');
  vi.stubEnv('TELEGRAM_CHAT_ID', String(CHAT_ID));
  vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', SECRET);
  rmSync(resolve(process.cwd(), 'data/test-uploads'), { recursive: true, force: true });
  stubTelegram();
  sentEmails = [];
  previousMailer = getMailer();
  setMailer({ send: async (email) => void sentEmails.push(email) });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  setMailer(previousMailer);
});

async function studentWithPendingRequest() {
  const student = await createUser({ role: 'student' });
  await prisma.user.update({ where: { id: student.id }, data: { emailConfirmedAt: new Date() } });
  const file = await createFile(student.id);
  const request = await prisma.verificationRequest.create({ data: { userId: student.id, fileId: file.id, status: 'pending' } });
  return { student, request };
}

const click = (action: 'verify' | 'reject', userId: string, overrides: Record<string, unknown> = {}) => ({
  callback_query: {
    id: 'cbq-1',
    from: { id: 42, username: 'mod_olena' },
    data: `${action}:${userId}`,
    message: { message_id: 7, chat: { id: CHAT_ID }, caption: 'Student verification request\nEmail: a@b.ua' },
    ...overrides,
  },
});
/** `secret` null: no header at all. */
const webhook = (body: object, secret: string | null = SECRET) => {
  const request = api().post('/api/webhooks/telegram');
  if (secret !== null) request.set('X-Telegram-Bot-Api-Secret-Token', secret);
  return request.send(body);
};

describe('US-08 sc.1 (Telegram): the document goes to the moderators group', () => {
  async function upload(bytes: Buffer, filename: string, contentType: string) {
    const student = await createUser({ role: 'student' });
    await prisma.user.update({ where: { id: student.id }, data: { emailConfirmedAt: new Date() } });
    await prisma.session.create({ data: { id: hashSessionId('sid-1'), userId: student.id, expiresAt: new Date(Date.now() + 3600_000) } });
    const res = await api().post('/api/me/verification').set('Cookie', 'sid=sid-1').set('Origin', ORIGIN).attach('file', bytes, { filename, contentType });
    return { student, res };
  }

  it('a photo is sent with sendPhoto, a caption with the email and id, and the two buttons', async () => {
    const { student, res } = await upload(jpeg, 'ticket.jpg', 'image/jpeg');
    expect(res.status).toBe(201);
    expect(callsTo('sendPhoto')).toHaveLength(1);
    const form = callsTo('sendPhoto')[0]!.body as FormData;
    expect(form.get('chat_id')).toBe(String(CHAT_ID));
    expect(form.get('photo')).toBeInstanceOf(Blob);
    expect(String(form.get('caption'))).toContain(student.email);
    expect(String(form.get('caption'))).toContain(student.id);
    const buttons = JSON.parse(String(form.get('reply_markup'))).inline_keyboard[0];
    expect(buttons).toEqual([
      { text: '✅ Approve', callback_data: `verify:${student.id}` },
      { text: '❌ Reject', callback_data: `reject:${student.id}` },
    ]);
  });

  it('a PDF cannot go through sendPhoto, so sendDocument is used', async () => {
    const { res } = await upload(pdf, 'ticket.pdf', 'application/pdf');
    expect(res.status).toBe(201);
    expect(callsTo('sendPhoto')).toHaveLength(0);
    expect(callsTo('sendDocument')).toHaveLength(1);
  });

  it('nothing is sent when Telegram is not configured, and the upload still works', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', '');
    const { res } = await upload(jpeg, 'ticket.jpg', 'image/jpeg');
    expect(res.status).toBe(201);
    expect(calls).toHaveLength(0);
  });

  it('a Telegram outage does not fail the upload: the request stays pending', async () => {
    stubTelegram(500);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { student, res } = await upload(jpeg, 'ticket.jpg', 'image/jpeg');
    expect(res.status).toBe(201);
    expect(res.body.verification.status).toBe('pending');
    expect((await prisma.verificationRequest.findFirst({ where: { userId: student.id } }))?.status).toBe('pending');
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain('test-token');
    consoleError.mockRestore();
  });
});

describe('POST /api/webhooks/telegram: access', () => {
  it('a missing or wrong secret header is 404 NOT_FOUND and changes nothing', async () => {
    const { student, request } = await studentWithPendingRequest();
    for (const secret of [null, 'wrong-secret']) {
      const res = await webhook(click('verify', student.id), secret);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    }
    expect((await prisma.verificationRequest.findUnique({ where: { id: request.id } }))?.status).toBe('pending');
    expect(calls).toHaveLength(0);
  });

  it('is 404 when Telegram is not configured', async () => {
    vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', '');
    const res = await webhook({}, '');
    expect(res.status).toBe(404);
  });

  it('a click from another chat is ignored (200) and changes nothing', async () => {
    const { student, request } = await studentWithPendingRequest();
    const res = await webhook(click('verify', student.id, { message: { message_id: 7, chat: { id: 999 } } }));
    expect(res.status).toBe(200);
    expect((await prisma.verificationRequest.findUnique({ where: { id: request.id } }))?.status).toBe('pending');
    expect(calls).toHaveLength(0);
  });

  it('an update without a button click is ignored with 200', async () => {
    const res = await webhook({ message: { text: 'hello' } });
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(0);
  });

  it('an unknown callback_data only answers the click', async () => {
    const res = await webhook(click('verify', 'x', { data: 'drop table' }));
    expect(res.status).toBe(200);
    expect(callsTo('answerCallbackQuery')).toHaveLength(1);
    expect(callsTo('editMessageCaption')).toHaveLength(0);
  });
});

describe('US-39 sc.1 (Telegram): ✅ Approve', () => {
  it('approves the request, gives the badge, records the moderator, edits the message and emails the student', async () => {
    const { student, request } = await studentWithPendingRequest();
    const res = await webhook(click('verify', student.id));
    expect(res.status).toBe(200);

    const after = await prisma.verificationRequest.findUnique({ where: { id: request.id } });
    expect(after?.status).toBe('approved');
    expect(after?.decidedAt).not.toBeNull();
    const user = await prisma.user.findUnique({ where: { id: student.id } });
    expect(user?.studentVerifiedAt).not.toBeNull();
    expect(user?.role).toBe('student');

    const audit = await prisma.auditEvent.findFirstOrThrow({ where: { entityId: student.id } });
    expect(audit.action).toBe('verification.approved');
    expect(JSON.parse(audit.dataJson)).toMatchObject({ via: 'telegram', moderator: '@mod_olena' });

    const edit = jsonBody(callsTo('editMessageCaption')[0]!);
    expect(edit).toMatchObject({ chat_id: CHAT_ID, message_id: 7, reply_markup: { inline_keyboard: [] } });
    expect(String(edit.caption)).toContain('✅ Approved by @mod_olena');
    expect(callsTo('answerCallbackQuery')).toHaveLength(1);

    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0]?.to).toBe(student.email);
    expect(sentEmails[0]?.subject).toContain('підтверджено');
  });

  it('a second click (double click or another moderator) decides nothing and sends no second email', async () => {
    const { student } = await studentWithPendingRequest();
    await webhook(click('verify', student.id));
    calls.length = 0;
    const second = await webhook(click('reject', student.id, { from: { id: 43, username: 'mod_two' } }));
    expect(second.status).toBe(200);
    expect(sentEmails).toHaveLength(1);
    expect(callsTo('editMessageCaption')).toHaveLength(0);
    expect((await prisma.verificationRequest.findFirst({ where: { userId: student.id } }))?.status).toBe('approved');
    expect((await prisma.user.findUnique({ where: { id: student.id } }))?.studentVerifiedAt).not.toBeNull();
    expect(await prisma.auditEvent.count()).toBe(1);
  });

  it('two simultaneous clicks produce exactly one decision', async () => {
    const { student } = await studentWithPendingRequest();
    await Promise.all([webhook(click('verify', student.id)), webhook(click('verify', student.id))]);
    expect(await prisma.auditEvent.count()).toBe(1);
    expect(sentEmails).toHaveLength(1);
  });

  it('a Telegram failure after the commit does not undo the decision or the email', async () => {
    const { student } = await studentWithPendingRequest();
    stubTelegram(500);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await webhook(click('verify', student.id));
    expect(res.status).toBe(200);
    expect((await prisma.user.findUnique({ where: { id: student.id } }))?.studentVerifiedAt).not.toBeNull();
    expect(sentEmails).toHaveLength(1);
    consoleError.mockRestore();
  });
});

describe('US-39 sc.2 (Telegram): ❌ Reject', () => {
  it('rejects the request without the badge, edits the message and emails the student', async () => {
    const { student, request } = await studentWithPendingRequest();
    const res = await webhook(click('reject', student.id));
    expect(res.status).toBe(200);

    const after = await prisma.verificationRequest.findUnique({ where: { id: request.id } });
    expect(after?.status).toBe('rejected');
    expect(after?.reason).toBeTruthy();
    expect((await prisma.user.findUnique({ where: { id: student.id } }))?.studentVerifiedAt).toBeNull();

    expect(String(jsonBody(callsTo('editMessageCaption')[0]!).caption)).toContain('❌ Rejected by @mod_olena');
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0]?.subject).toContain('відхилено');
  });

  it('a student may upload again after a rejection (INV-04 counts only pending)', async () => {
    const { student } = await studentWithPendingRequest();
    await webhook(click('reject', student.id));
    const file = await createFile(student.id);
    await expect(prisma.verificationRequest.create({ data: { userId: student.id, fileId: file.id, status: 'pending' } })).resolves.toBeTruthy();
  });
});
