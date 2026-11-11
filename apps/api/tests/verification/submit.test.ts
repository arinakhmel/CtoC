import { existsSync, readdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { hashSessionId } from '../../src/modules/identity/domain';
import { detectDocumentMime } from '../../src/modules/verification/domain';
import { createLocalFileStorage } from '../../src/platform/ports/file-storage';
import { api } from '../helpers/app';
import { prisma, resetDb } from '../helpers/db';

const ORIGIN = 'http://localhost:5173';
const UPLOAD_DIR = resolve(process.cwd(), 'data/test-uploads');
const storedFiles = () => (existsSync(UPLOAD_DIR) ? readdirSync(UPLOAD_DIR) : []);

const MB = 1024 * 1024;
const withHeader = (header: number[], size: number) => Buffer.concat([Buffer.from(header), Buffer.alloc(Math.max(size - header.length, 0))]);
const jpeg = (size = 200) => withHeader([0xff, 0xd8, 0xff, 0xe0], size);
const png = (size = 200) => withHeader([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], size);
const pdf = (size = 200) => withHeader([...Buffer.from('%PDF-1.4')], size);
const exe = () => withHeader([0x4d, 0x5a, 0x90, 0x00], 200); // "MZ", a Windows executable
const zip = () => withHeader([0x50, 0x4b, 0x03, 0x04], 200); // "PK", a zip archive

let counter = 0;
async function loginAs(overrides: Record<string, unknown> = {}) {
  counter += 1;
  const user = await prisma.user.create({
    data: {
      email: `student${counter}@university.edu.ua`,
      passwordHash: 'x',
      displayName: 'Олена Коваль',
      role: 'student',
      emailConfirmedAt: new Date(),
      ...overrides,
    },
  });
  const sid = `session-${counter}`;
  await prisma.session.create({ data: { id: hashSessionId(sid), userId: user.id, expiresAt: new Date(Date.now() + 3600_000) } });
  return { user, cookie: `sid=${sid}` };
}

const upload = (cookie: string, bytes: Buffer, filename: string, contentType: string) =>
  api().post('/api/me/verification').set('Cookie', cookie).set('Origin', ORIGIN).attach('file', bytes, { filename, contentType });

beforeEach(async () => {
  await resetDb();
  rmSync(UPLOAD_DIR, { recursive: true, force: true });
});

describe('POST /api/me/verification: US-08 sc.1', () => {
  it.each([
    ['JPG', () => jpeg(), 'ticket.jpg', 'image/jpeg'],
    ['PNG', () => png(), 'ticket.png', 'image/png'],
    ['PDF', () => pdf(), 'certificate.pdf', 'application/pdf'],
  ])('US-08 sc.1 a %s document creates a pending request and the user does not get the student role', async (_name, make, filename, contentType) => {
    const { user, cookie } = await loginAs();

    const res = await upload(cookie, make(), filename, contentType);

    expect(res.status).toBe(201);
    expect(res.body.verification).toMatchObject({ status: 'pending', label: 'Очікує перевірки', reason: null, decidedAt: null });
    expect(res.body.verification.id).toEqual(expect.any(String));

    const requests = await prisma.verificationRequest.findMany({ where: { userId: user.id } });
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ status: 'pending', decidedBy: null });
    const file = await prisma.file.findUniqueOrThrow({ where: { id: requests[0]!.fileId } });
    expect(file).toMatchObject({ ownerId: user.id, kind: 'student_document', originalName: filename, mime: contentType });
    expect(storedFiles()).toEqual([file.storageKey]);
    expect((await createLocalFileStorage().get(file.storageKey)).equals(make())).toBe(true);

    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.studentVerifiedAt).toBeNull(); // INV-03: only a moderator grants it
  });

  it('US-08 sc.1 GET returns the pending request, or null before any upload', async () => {
    const { cookie } = await loginAs();
    const before = await api().get('/api/me/verification').set('Cookie', cookie);
    await upload(cookie, jpeg(), 'ticket.jpg', 'image/jpeg');
    const after = await api().get('/api/me/verification').set('Cookie', cookie);

    expect(before.status).toBe(200);
    expect(before.body).toEqual({ verification: null });
    expect(after.status).toBe(200);
    expect(after.body.verification).toMatchObject({ status: 'pending', label: 'Очікує перевірки' });
  });

  it('US-08 sc.1 without a session the answer is 401 AUTH_REQUIRED', async () => {
    const res = await api().post('/api/me/verification').attach('file', jpeg(), { filename: 'a.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_REQUIRED');
    expect((await api().get('/api/me/verification')).status).toBe(401);
  });

  it('US-08 sc.1 an unconfirmed email is 403 EMAIL_NOT_CONFIRMED and a customer is 403 ROLE_FORBIDDEN', async () => {
    const unconfirmed = await loginAs({ emailConfirmedAt: null });
    const customer = await loginAs({ role: 'customer', email: 'owner@company.com' });

    const a = await upload(unconfirmed.cookie, jpeg(), 'a.jpg', 'image/jpeg');
    const b = await upload(customer.cookie, jpeg(), 'a.jpg', 'image/jpeg');

    expect(a.status).toBe(403);
    expect(a.body.error.code).toBe('EMAIL_NOT_CONFIRMED');
    expect(b.status).toBe(403);
    expect(b.body.error.code).toBe('ROLE_FORBIDDEN');
    expect(await prisma.verificationRequest.count()).toBe(0);
    expect(storedFiles()).toHaveLength(0);
  });

  it('US-08 sc.1 an already verified student gets 409 ALREADY_VERIFIED', async () => {
    const { cookie } = await loginAs({ studentVerifiedAt: new Date() });

    const res = await upload(cookie, jpeg(), 'a.jpg', 'image/jpeg');

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ALREADY_VERIFIED');
    expect(await prisma.verificationRequest.count()).toBe(0);
    expect(storedFiles()).toHaveLength(0);
  });

  it('US-08 sc.1 INV-04 a second upload while one is pending is 409 VERIFICATION_PENDING and stores nothing', async () => {
    const { cookie } = await loginAs();
    await upload(cookie, jpeg(), 'a.jpg', 'image/jpeg');

    const res = await upload(cookie, png(), 'b.png', 'image/png');

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('VERIFICATION_PENDING');
    // rollback: no second File row and no orphan file on disk
    expect(await prisma.file.count()).toBe(1);
    expect(await prisma.verificationRequest.count()).toBe(1);
    expect(storedFiles()).toHaveLength(1);
  });

  it('US-08 sc.1 INV-04 two concurrent uploads: one 201, one 409, one pending request, one stored file', async () => {
    const { cookie } = await loginAs();

    const results = await Promise.all([
      upload(cookie, jpeg(), 'a.jpg', 'image/jpeg'),
      upload(cookie, png(), 'b.png', 'image/png'),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(results.find((r) => r.status === 409)!.body.error.code).toBe('VERIFICATION_PENDING');
    expect(await prisma.verificationRequest.count({ where: { status: 'pending' } })).toBe(1);
    expect(await prisma.file.count()).toBe(1);
    expect(storedFiles()).toHaveLength(1);
  });

  it('US-08 sc.1 after a rejection the student can submit a new document', async () => {
    const { user, cookie } = await loginAs();
    const first = await upload(cookie, jpeg(), 'a.jpg', 'image/jpeg');
    await prisma.verificationRequest.update({
      where: { id: first.body.verification.id },
      data: { status: 'rejected', reason: 'Документ нечитабельний' },
    });

    const status = await api().get('/api/me/verification').set('Cookie', cookie);
    const second = await upload(cookie, pdf(), 'b.pdf', 'application/pdf');

    expect(status.body.verification).toMatchObject({ status: 'rejected', label: 'Відхилено', reason: 'Документ нечитабельний' });
    expect(second.status).toBe(201);
    expect(await prisma.verificationRequest.count({ where: { userId: user.id } })).toBe(2);
  });

  it('US-08 sc.1 a missing file is VALIDATION_FAILED', async () => {
    const { cookie } = await loginAs();
    const res = await api().post('/api/me/verification').set('Cookie', cookie).set('Origin', ORIGIN).field('note', 'no file');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });
});

describe('POST /api/me/verification: US-08 sc.2 wrong file type', () => {
  it.each([
    ['an .exe', () => exe(), 'virus.exe', 'application/x-msdownload'],
    ['a .zip', () => zip(), 'archive.zip', 'application/zip'],
    ['an .exe renamed to .jpg with an image content type', () => exe(), 'ticket.jpg', 'image/jpeg'],
    ['an empty file', () => Buffer.alloc(0), 'empty.pdf', 'application/pdf'],
  ])('US-08 sc.2 %s is rejected with FILE_TYPE_NOT_ALLOWED and nothing is stored', async (_name, make, filename, contentType) => {
    const { cookie } = await loginAs();

    const res = await upload(cookie, make(), filename, contentType);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('FILE_TYPE_NOT_ALLOWED');
    expect(res.body.error.message).toBe('Дозволено лише зображення або PDF');
    expect(res.body.error.details).toEqual([{ field: 'file', code: 'FILE_TYPE_NOT_ALLOWED' }]);
    expect(await prisma.verificationRequest.count()).toBe(0);
    expect(await prisma.file.count()).toBe(0);
    expect(storedFiles()).toHaveLength(0);
  });

  it('US-08 sc.2 the type is detected from the content: a JPEG named .exe is accepted as an image', () => {
    expect(detectDocumentMime(jpeg())).toBe('image/jpeg');
    expect(detectDocumentMime(png())).toBe('image/png');
    expect(detectDocumentMime(pdf())).toBe('application/pdf');
    expect(detectDocumentMime(exe())).toBeNull();
    expect(detectDocumentMime(zip())).toBeNull();
    expect(detectDocumentMime(Buffer.alloc(0))).toBeNull();
  });
});

describe('POST /api/me/verification: US-08 sc.3 file size', () => {
  it('US-08 sc.3 a file of exactly 10 MB is accepted', async () => {
    const { cookie } = await loginAs();

    const res = await upload(cookie, jpeg(10 * MB), 'big.jpg', 'image/jpeg');

    expect(res.status).toBe(201);
    expect(storedFiles()).toHaveLength(1);
  });

  it('US-08 sc.3 a file over 10 MB is rejected with FILE_TOO_LARGE and nothing is stored', async () => {
    const { cookie } = await loginAs();

    const res = await upload(cookie, jpeg(10 * MB + 1), 'huge.jpg', 'image/jpeg');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('FILE_TOO_LARGE');
    expect(res.body.error.message).toBe('Файл занадто великий. Максимальний розмір — 10 МБ');
    expect(await prisma.verificationRequest.count()).toBe(0);
    expect(await prisma.file.count()).toBe(0);
    expect(storedFiles()).toHaveLength(0);
  });
});

describe('FileStorage port (local disk)', () => {
  it('US-08 stores, reads and deletes a file by key, and refuses a key outside its folder', async () => {
    const storage = createLocalFileStorage('data/test-uploads');

    await storage.put('abc', Buffer.from('hello'));
    expect((await storage.get('abc')).toString()).toBe('hello');
    await storage.delete('abc');
    await storage.delete('abc'); // deleting twice is fine
    await expect(storage.get('abc')).rejects.toThrow();
    await expect(storage.put('../escape', Buffer.from('x'))).rejects.toThrow('Invalid storage key');
  });
});
