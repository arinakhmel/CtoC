import { existsSync, readdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { LIMITS } from '@ctoc/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hashSessionId } from '../../src/modules/identity/domain';
import { getFileStorage, setFileStorage, type FileStorage } from '../../src/platform/ports/file-storage';
import { api } from '../helpers/app';
import { prisma, resetDb } from '../helpers/db';
import { createTask } from '../helpers/factories';

const ORIGIN = 'http://localhost:5173';
const UPLOAD_DIR = resolve(process.cwd(), 'data/test-uploads');
const storedFiles = () => (existsSync(UPLOAD_DIR) ? readdirSync(UPLOAD_DIR) : []);

const MB = 1024 * 1024;
const pdf = (size = 300) => Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(size, 0x20)]);
const withHeader = (header: number[], size = 300) => Buffer.concat([Buffer.from(header), Buffer.alloc(size, 0x20)]);

let counter = 0;
async function loginAs(role: 'student' | 'customer') {
  counter += 1;
  const user = await prisma.user.create({
    data: {
      email: `delivery${counter}@${role === 'student' ? 'university.edu.ua' : 'company.com'}`,
      passwordHash: 'x',
      displayName: 'Користувач',
      role,
      emailConfirmedAt: new Date(),
      studentVerifiedAt: role === 'student' ? new Date() : null,
    },
  });
  const sid = `delivery-session-${counter}`;
  await prisma.session.create({ data: { id: hashSessionId(sid), userId: user.id, expiresAt: new Date(Date.now() + 3600_000) } });
  return { user, cookie: `sid=${sid}` };
}

const upload = (taskId: string, cookie: string | undefined, bytes: Buffer, filename = 'result.pdf', contentType = 'application/pdf') => {
  const req = api().post(`/api/tasks/${taskId}/result/files`);
  return (cookie ? req.set('Cookie', cookie).set('Origin', ORIGIN) : req).attach('file', bytes, { filename, contentType });
};
const readResult = (taskId: string, cookie: string) => api().get(`/api/tasks/${taskId}/result`).set('Cookie', cookie);
const download = (fileId: string, cookie?: string) => {
  const req = api().get(`/api/files/${fileId}`);
  return cookie ? req.set('Cookie', cookie) : req;
};

let customer: Awaited<ReturnType<typeof loginAs>>;
let student: Awaited<ReturnType<typeof loginAs>>;
const activeTask = (overrides: Record<string, unknown> = {}) =>
  createTask(customer.user.id, { status: 'in_progress', executorId: student.user.id, publishedAt: new Date(), assignedAt: new Date(), ...overrides });

beforeEach(async () => {
  await resetDb();
  rmSync(UPLOAD_DIR, { recursive: true, force: true });
  customer = await loginAs('customer');
  student = await loginAs('student');
});

afterEach(() => setFileStorage(undefined));

describe('Result upload: US-27 sc.1', () => {
  it('US-27 sc.1 the executor uploads a file: 201, linked to the open draft version, stored with its hash', async () => {
    const task = await activeTask();
    const bytes = pdf();

    const res = await upload(task.id, student.cookie, bytes, 'Звіт.pdf');

    expect(res.status).toBe(201);
    expect(res.body.result).toMatchObject({ version: 1, status: 'draft', revisionComment: null, submittedAt: null });
    expect(res.body.result.files).toHaveLength(1);
    expect(res.body.result.files[0]).toMatchObject({ name: 'Звіт.pdf', sizeBytes: bytes.length, mime: 'application/pdf' });
    expect(Object.keys(res.body.result.files[0]).sort()).toEqual(['createdAt', 'id', 'mime', 'name', 'sizeBytes']);

    const links = await prisma.resultFile.findMany({ include: { file: true, resultVersion: true } });
    expect(links).toHaveLength(1);
    expect(links[0]!.resultVersion).toMatchObject({ taskId: task.id, version: 1, status: 'draft' });
    expect(links[0]!.file).toMatchObject({ kind: 'result', ownerId: student.user.id, originalName: 'Звіт.pdf', sizeBytes: bytes.length });
    expect(links[0]!.file.sha256).toHaveLength(64);
    expect(await getFileStorage().get(links[0]!.file.storageKey)).toEqual(bytes);
  });

  it('US-27 sc.1 a second file goes into the same version, and the status of the task does not change', async () => {
    const task = await activeTask();

    await upload(task.id, student.cookie, pdf(), 'a.pdf');
    const second = await upload(task.id, student.cookie, pdf(400), 'b.pdf');

    expect(second.status).toBe(201);
    expect(second.body.result.version).toBe(1);
    expect(second.body.result.files.map((file: { name: string }) => file.name)).toEqual(['a.pdf', 'b.pdf']);
    expect(await prisma.resultVersion.count()).toBe(1);
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe('in_progress');
  });

  it('US-27 sc.1 GET /result shows the files after a reload, and null before the first upload', async () => {
    const task = await activeTask();
    expect((await readResult(task.id, student.cookie)).body).toEqual({ result: null });

    await upload(task.id, student.cookie, pdf(), 'a.pdf');

    const res = await readResult(task.id, student.cookie);
    expect(res.status).toBe(200);
    expect(res.body.result.files).toHaveLength(1);
  });

  it('US-27 sc.1 the executor downloads the file as an attachment, byte for byte, never as the type it claimed', async () => {
    const task = await activeTask();
    const bytes = pdf(500);
    const uploaded = await upload(task.id, student.cookie, bytes, 'Звіт за листопад.pdf', 'text/html');
    const id = uploaded.body.result.files[0].id as string;

    const res = await download(id, student.cookie);

    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/^attachment;/);
    expect(res.headers['content-disposition']).toContain(encodeURIComponent('Звіт за листопад.pdf'));
    expect(res.headers['content-type']).toMatch(/^application\/octet-stream/);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(Buffer.from(res.body as Buffer).equals(bytes)).toBe(true);
  });
});

describe('Result upload: US-27 sc.2 (forbidden types)', () => {
  it.each([
    ['.bat', 'run.bat'],
    ['.scr', 'screen.scr'],
    ['.exe in capitals', 'SETUP.EXE'],
  ])('US-27 sc.2 a %s file is blocked: 400 FILE_TYPE_NOT_ALLOWED, nothing is saved', async (_label, filename) => {
    const task = await activeTask();

    const res = await upload(task.id, student.cookie, pdf(), filename, 'application/octet-stream');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('FILE_TYPE_NOT_ALLOWED');
    expect(res.body.error.details).toEqual([{ field: 'file', code: 'FILE_TYPE_NOT_ALLOWED' }]);
    expect(await prisma.file.count()).toBe(0);
    expect(await prisma.resultVersion.count()).toBe(0);
    expect(storedFiles()).toEqual([]);
  });

  it('US-27 sc.2 a Windows executable renamed to .pdf is caught by its content', async () => {
    const task = await activeTask();

    const res = await upload(task.id, student.cookie, withHeader([0x4d, 0x5a, 0x90, 0x00]), 'report.pdf');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('FILE_TYPE_NOT_ALLOWED');
    expect(await prisma.file.count()).toBe(0);
    expect(storedFiles()).toEqual([]);
  });

  it('US-27 sc.2 a script with a #! line is blocked, but a zip archive is allowed (OQ-18)', async () => {
    const task = await activeTask();

    const script = await upload(task.id, student.cookie, Buffer.from('#!/bin/sh\necho hi\n'), 'notes.txt', 'text/plain');
    const zip = await upload(task.id, student.cookie, withHeader([0x50, 0x4b, 0x03, 0x04]), 'project.zip', 'application/zip');

    expect(script.status).toBe(400);
    expect(script.body.error.code).toBe('FILE_TYPE_NOT_ALLOWED');
    expect(zip.status).toBe(201);
  });
});

describe('Result upload: US-27 sc.3 (size)', () => {
  it('US-27 sc.3 a file over 50 MB is refused: 400 FILE_TOO_LARGE, nothing is saved', async () => {
    const task = await activeTask();

    const res = await upload(task.id, student.cookie, Buffer.alloc(LIMITS.resultMaxBytes + 1, 0x20), 'big.pdf');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('FILE_TOO_LARGE');
    expect(res.body.error.details).toEqual([{ field: 'file', code: 'FILE_TOO_LARGE' }]);
    expect(await prisma.file.count()).toBe(0);
    expect(storedFiles()).toEqual([]);
  });

  it('US-27 sc.3 a file of exactly 50 MB is accepted', async () => {
    const task = await activeTask();

    const res = await upload(task.id, student.cookie, Buffer.alloc(LIMITS.resultMaxBytes, 0x20), 'exact.pdf');

    expect(res.status).toBe(201);
    expect(res.body.result.files[0].sizeBytes).toBe(50 * MB);
  });
});

describe('Result upload: access, state and limits (INV-14, INV-16)', () => {
  it('INV-14 a logged-out caller gets 401', async () => {
    const task = await activeTask();
    expect((await upload(task.id, undefined, pdf())).status).toBe(401);
  });

  it('INV-14 the customer of the task is not the executor: 403 NOT_EXECUTOR, nothing is saved', async () => {
    const task = await activeTask();

    const res = await upload(task.id, customer.cookie, pdf());

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NOT_EXECUTOR');
    expect(await prisma.file.count()).toBe(0);
    expect(storedFiles()).toEqual([]);
  });

  it('INV-14 another student gets 403 NOT_EXECUTOR on upload and on reading the result', async () => {
    const task = await activeTask();
    const other = await loginAs('student');

    expect((await upload(task.id, other.cookie, pdf())).body.error.code).toBe('NOT_EXECUTOR');
    expect((await readResult(task.id, other.cookie)).status).toBe(403);
  });

  it('INV-14 access is checked before the file: a stranger with a forbidden or missing file gets 403, not 400', async () => {
    const task = await activeTask();

    // A .bat from the executor would be 400. The server answers before it reads the body, so a stranger cannot make it buffer a file.
    const forbidden = await upload(task.id, customer.cookie, pdf(), 'run.bat', 'application/octet-stream');
    const missing = await api().post(`/api/tasks/${task.id}/result/files`).set('Cookie', customer.cookie).set('Origin', ORIGIN);

    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.code).toBe('NOT_EXECUTOR');
    expect(missing.status).toBe(403);
    expect(storedFiles()).toEqual([]);
  });

  it('an unknown task with a forbidden file is 404, not 400', async () => {
    const res = await upload('00000000-0000-4000-8000-000000000000', student.cookie, pdf(), 'run.bat', 'application/octet-stream');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('INV-16 a submitted version is never given a file, even if the task still looks editable: 409 RESULT_LOCKED', async () => {
    const task = await activeTask(); // the task state alone would allow the upload
    const version = await prisma.resultVersion.create({ data: { taskId: task.id, version: 1, status: 'submitted', submittedAt: new Date() } });

    const res = await upload(task.id, student.cookie, pdf());

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('RESULT_LOCKED');
    expect(await prisma.resultFile.count({ where: { resultVersionId: version.id } })).toBe(0);
    expect(await prisma.file.count()).toBe(0);
    expect(storedFiles()).toEqual([]);
  });

  it('an unknown task is 404 NOT_FOUND', async () => {
    const res = await upload('00000000-0000-4000-8000-000000000000', student.cookie, pdf());
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('a missing file is 400 VALIDATION_FAILED', async () => {
    const task = await activeTask();
    const res = await api().post(`/api/tasks/${task.id}/result/files`).set('Cookie', student.cookie).set('Origin', ORIGIN);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('INV-16 a task in review is locked: 409 RESULT_LOCKED', async () => {
    const task = await activeTask({ status: 'in_review' });

    const res = await upload(task.id, student.cookie, pdf());

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('RESULT_LOCKED');
    expect(await prisma.file.count()).toBe(0);
    expect(storedFiles()).toEqual([]);
  });

  it.each(['done', 'cancelled'])('a %s task cannot get files: 409 INVALID_TRANSITION', async (status) => {
    const task = await activeTask({ status });
    const res = await upload(task.id, student.cookie, pdf());
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
  });

  it('a task in revision accepts files again, in the next version when the earlier one was returned', async () => {
    const task = await activeTask({ status: 'revision' });
    await prisma.resultVersion.create({ data: { taskId: task.id, version: 1, status: 'returned', revisionComment: 'Додайте висновки', decidedAt: new Date() } });

    const res = await upload(task.id, student.cookie, pdf());

    expect(res.status).toBe(201);
    expect(res.body.result).toMatchObject({ version: 2, status: 'draft' });
  });

  it('an 11th file is refused: 400 TOO_MANY_FILES, and its bytes are not left on disk', async () => {
    const task = await activeTask();
    for (let i = 0; i < LIMITS.resultFilesMax; i += 1) {
      expect((await upload(task.id, student.cookie, pdf(100 + i), `f${i}.pdf`)).status).toBe(201);
    }

    const res = await upload(task.id, student.cookie, pdf(900), 'eleventh.pdf');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('TOO_MANY_FILES');
    expect(await prisma.resultFile.count()).toBe(LIMITS.resultFilesMax);
    expect(storedFiles()).toHaveLength(LIMITS.resultFilesMax);
  });

  it('INV-16 the task is submitted between the check and the write: the conditional update refuses, nothing is left', async () => {
    const task = await activeTask();
    // The real storage runs first, then the task moves on before the transaction starts: the race the lock closes.
    const real = getFileStorage();
    const racing: FileStorage = {
      ...real,
      put: async (key, bytes) => {
        await real.put(key, bytes);
        await prisma.task.update({ where: { id: task.id }, data: { status: 'in_review' } });
      },
    };
    setFileStorage(racing);

    const res = await upload(task.id, student.cookie, pdf());

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('RESULT_LOCKED');
    expect(await prisma.file.count()).toBe(0);
    expect(await prisma.resultVersion.count()).toBe(0);
    expect(storedFiles()).toEqual([]);
  });

  it('rollback: a failure inside the transaction leaves no File row, no version and no file on disk', async () => {
    const task = await activeTask();
    // The key the service just chose is taken in the database before the transaction starts, so the File insert fails
    // (unique storage_key) after the draft version was created in the same transaction.
    const real = getFileStorage();
    setFileStorage({
      ...real,
      put: async (key, bytes) => {
        await real.put(key, bytes);
        await prisma.file.create({
          data: { ownerId: student.user.id, kind: 'result', storageKey: key, originalName: 'x', mime: 'a/b', sizeBytes: 1, sha256: 'h' },
        });
      },
    });

    const res = await upload(task.id, student.cookie, pdf());

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(await prisma.resultVersion.count()).toBe(0);
    expect(await prisma.file.count()).toBe(1); // only the row that caused the failure
    expect(await prisma.resultFile.count()).toBe(0);
    expect(storedFiles()).toEqual([]); // the bytes are removed again
  });

  it('INV-15 limit: parallel uploads never leave more than 10 files in a version', async () => {
    const task = await activeTask();

    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => upload(task.id, student.cookie, pdf(100 + i), `p${i}.pdf`)));

    const created = results.filter((res) => res.status === 201).length;
    expect(created).toBe(LIMITS.resultFilesMax);
    expect(results.filter((res) => res.status === 400).every((res) => res.body.error.code === 'TOO_MANY_FILES')).toBe(true);
    expect(await prisma.resultFile.count()).toBe(LIMITS.resultFilesMax);
    expect(await prisma.resultVersion.count()).toBe(1);
  });
});

describe('GET /api/files/:fileId (NFR-07)', () => {
  it("the task's own customer gets 403 FILE_FORBIDDEN (the customer's access to a submitted result comes with US-28/US-31), a logged-out caller 401, an unknown id 404", async () => {
    const task = await activeTask();
    const id = (await upload(task.id, student.cookie, pdf())).body.result.files[0].id as string;

    const owner = await download(id, customer.cookie);
    expect(owner.status).toBe(403);
    expect(owner.body.error.code).toBe('FILE_FORBIDDEN');
    expect((await download(id)).status).toBe(401);
    expect((await download('00000000-0000-4000-8000-000000000000', student.cookie)).status).toBe(404);
  });
});

describe('Access to a result is for its executor only in US-27 (INV-14, NFR-07)', () => {
  /** A task with one uploaded file, and the id of that file. */
  const taskWithFile = async () => {
    const task = await activeTask();
    const id = (await upload(task.id, student.cookie, pdf(), 'secret.pdf')).body.result.files[0].id as string;
    return { task, id };
  };
  const forbidden = (res: { status: number; body: { error: { code: string } } }, code: string) => {
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe(code);
  };

  it("the task's customer cannot read the result: 403 NOT_EXECUTOR (US-28/US-31 add the customer's view of a submitted result)", async () => {
    const { task } = await taskWithFile();

    forbidden(await readResult(task.id, customer.cookie), 'NOT_EXECUTOR');
  });

  it('an unrelated student cannot download the file: 403 FILE_FORBIDDEN', async () => {
    const { id } = await taskWithFile();
    const stranger = await loginAs('student');

    forbidden(await download(id, stranger.cookie), 'FILE_FORBIDDEN');
  });

  it('an unrelated customer cannot read the result, download the file or upload: 403 each, nothing is changed', async () => {
    const { task, id } = await taskWithFile();
    const stranger = await loginAs('customer');

    forbidden(await readResult(task.id, stranger.cookie), 'NOT_EXECUTOR');
    forbidden(await download(id, stranger.cookie), 'FILE_FORBIDDEN');
    forbidden(await upload(task.id, stranger.cookie, pdf(), 'planted.pdf'), 'NOT_EXECUTOR');
    expect(await prisma.resultFile.count()).toBe(1);
    expect(await prisma.file.count()).toBe(1);
  });

  it('the executor of another task cannot read, download or add to this task: 403 each', async () => {
    const { task, id } = await taskWithFile();
    const other = await loginAs('student');
    const othersTask = await createTask(customer.user.id, { status: 'in_progress', executorId: other.user.id, publishedAt: new Date(), assignedAt: new Date() });

    forbidden(await readResult(task.id, other.cookie), 'NOT_EXECUTOR');
    forbidden(await download(id, other.cookie), 'FILE_FORBIDDEN');
    forbidden(await upload(task.id, other.cookie, pdf(), 'planted.pdf'), 'NOT_EXECUTOR');
    expect(await prisma.resultFile.count()).toBe(1);
    // Their own task still works, so the refusal above is about this task and not about the user.
    expect((await upload(othersTask.id, other.cookie, pdf(), 'mine.pdf')).status).toBe(201);
  });

  it('the customer cannot replace the result: uploading is 403 and there is no delete endpoint yet (US-29), so the file stays', async () => {
    const { task, id } = await taskWithFile();

    forbidden(await upload(task.id, customer.cookie, pdf(400), 'replacement.pdf'), 'NOT_EXECUTOR');
    const removal = await api().delete(`/api/tasks/${task.id}/result/files/${id}`).set('Cookie', customer.cookie).set('Origin', ORIGIN);

    // The route does not exist yet, so this is a plain 404. US-29 builds it and changes this assertion to 403 for the customer.
    expect(removal.status).toBe(404);
    expect(await prisma.resultFile.count()).toBe(1);
    expect((await download(id, student.cookie)).status).toBe(200);
  });
});
