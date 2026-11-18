import { randomUUID } from 'node:crypto';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { LIMITS } from '@ctoc/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hashSessionId } from '../../src/modules/identity/domain';
import { prisma as appPrisma } from '../../src/platform/db';
import { getFileStorage, setFileStorage } from '../../src/platform/ports/file-storage';
import { api } from '../helpers/app';
import { prisma, resetDb } from '../helpers/db';
import { createTask } from '../helpers/factories';

const ORIGIN = 'http://localhost:5173';
const UPLOAD_DIR = resolve(process.cwd(), 'data/test-uploads');
const storedFiles = () => (existsSync(UPLOAD_DIR) ? readdirSync(UPLOAD_DIR) : []);

let counter = 0;
async function loginAs(role: 'student' | 'customer') {
  counter += 1;
  const user = await prisma.user.create({
    data: {
      email: `del${counter}@${role === 'student' ? 'university.edu.ua' : 'company.com'}`,
      passwordHash: 'x',
      displayName: 'Користувач',
      role,
      emailConfirmedAt: new Date(),
      studentVerifiedAt: role === 'student' ? new Date() : null,
    },
  });
  const sid = `delete-session-${counter}`;
  await prisma.session.create({ data: { id: hashSessionId(sid), userId: user.id, expiresAt: new Date(Date.now() + 3600_000) } });
  return { user, cookie: `sid=${sid}`, sid };
}

const pdf = (size = 200) => Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(size, 0x20)]);
const upload = (taskId: string, cookie: string, name = 'result.pdf', bytes = pdf()) =>
  api().post(`/api/tasks/${taskId}/result/files`).set('Cookie', cookie).set('Origin', ORIGIN).attach('file', bytes, { filename: name, contentType: 'application/pdf' });
const remove = (taskId: string, fileId: string, cookie?: string, origin: string | null = ORIGIN) => {
  const req = api().delete(`/api/tasks/${taskId}/result/files/${fileId}`);
  if (cookie) req.set('Cookie', cookie);
  if (cookie && origin) req.set('Origin', origin);
  return req;
};
const submit = (taskId: string, cookie: string) => api().post(`/api/tasks/${taskId}/result/submit`).set('Cookie', cookie).set('Origin', ORIGIN);
const readResult = (taskId: string, cookie: string) => api().get(`/api/tasks/${taskId}/result`).set('Cookie', cookie);
const download = (fileId: string, cookie: string) => api().get(`/api/files/${fileId}`).set('Cookie', cookie);
const myWork = (cookie: string) => api().get('/api/me/work').set('Cookie', cookie);
const taskOf = (taskId: string, cookie: string) => api().get(`/api/tasks/${taskId}`).set('Cookie', cookie);

let customer: Awaited<ReturnType<typeof loginAs>>;
let student: Awaited<ReturnType<typeof loginAs>>;
const activeTask = (overrides: Record<string, unknown> = {}) =>
  createTask(customer.user.id, { status: 'in_progress', executorId: student.user.id, publishedAt: new Date(), assignedAt: new Date(), ...overrides });

/** A version with `files` files in the database and in the storage, as the upload of US-27 leaves it. */
async function addVersion(taskId: string, options: { version?: number; status?: string; files?: number } = {}) {
  const version = await prisma.resultVersion.create({
    data: { taskId, version: options.version ?? 1, status: options.status ?? 'draft', ...(options.status === 'returned' ? { revisionComment: 'Додайте висновки' } : {}) },
  });
  const ids: string[] = [];
  for (let i = 0; i < (options.files ?? 1); i += 1) {
    const storageKey = randomUUID();
    await getFileStorage().put(storageKey, pdf(50 + i));
    const file = await prisma.file.create({
      data: { ownerId: student.user.id, kind: 'result', storageKey, originalName: `f${i}.pdf`, mime: 'application/pdf', sizeBytes: 60, sha256: 'h' },
    });
    await prisma.resultFile.create({ data: { resultVersionId: version.id, fileId: file.id } });
    ids.push(file.id);
  }
  return { version, ids };
}

/** The hook for the fault-injection scenario (W-08): the `files` update of the delete transaction throws. */
function failFileUpdate() {
  const original = appPrisma.$transaction;
  appPrisma.$transaction = ((fn: (tx: object) => unknown, options?: unknown) =>
    (original as (...a: unknown[]) => unknown).call(
      appPrisma,
      (tx: object) =>
        fn(
          new Proxy(tx, {
            get(target, prop) {
              if (prop === 'file') {
                return new Proxy(Reflect.get(target, prop, target) as object, {
                  get(delegate, method) {
                    if (method === 'updateMany') return () => Promise.reject(new Error('injected failure'));
                    return Reflect.get(delegate, method, delegate);
                  },
                });
              }
              return Reflect.get(target, prop, target);
            },
          }),
        ),
      options,
    )) as never;
  return () => {
    appPrisma.$transaction = original;
  };
}

beforeEach(async () => {
  await resetDb();
  rmSync(UPLOAD_DIR, { recursive: true, force: true });
  customer = await loginAs('customer');
  student = await loginAs('student');
});

afterEach(() => {
  setFileStorage(undefined);
  vi.restoreAllMocks();
});

describe('The status «На перевірці» in the student list (US-29 sc.1, sc.2)', () => {
  /** The real path: upload, then submit. */
  async function submitted() {
    const task = await activeTask();
    expect((await upload(task.id, student.cookie)).status).toBe(201);
    expect((await submit(task.id, student.cookie)).status).toBe(200);
    return task;
  }

  it('US-29 sc.1 right after the submit the student list shows the task with the status in_review', async () => {
    const task = await submitted();

    const list = await myWork(student.cookie);

    expect(list.status).toBe(200);
    expect(list.body.tasks).toHaveLength(1);
    expect(list.body.tasks[0]).toMatchObject({ id: task.id, status: 'in_review' });
  });

  it('US-29 sc.2 the status is the server state: a new session, as after closing and opening the app, still shows in_review', async () => {
    const task = await submitted();
    // «Closes the application and opens it again»: a different session of the same student, nothing from the earlier page.
    const sid = 'delete-second-session';
    await prisma.session.create({ data: { id: hashSessionId(sid), userId: student.user.id, expiresAt: new Date(Date.now() + 3600_000) } });

    const list = await myWork(`sid=${sid}`);
    const details = await taskOf(task.id, `sid=${sid}`);

    expect(list.body.tasks[0]).toMatchObject({ id: task.id, status: 'in_review' });
    expect(details.body.task).toMatchObject({ id: task.id, status: 'in_review' });
  });
});

describe('Editing is blocked in review (US-29 sc.3)', () => {
  it('US-29 sc.3 deleting a file of a task in review is 409 RESULT_LOCKED: the file, its bytes and its download stay', async () => {
    const task = await activeTask({ status: 'in_review' });
    const { ids } = await addVersion(task.id, { status: 'submitted' });

    const res = await remove(task.id, ids[0]!, student.cookie);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('RESULT_LOCKED');
    expect(await prisma.resultFile.count()).toBe(1);
    expect((await prisma.file.findUniqueOrThrow({ where: { id: ids[0]! } })).deletedAt).toBeNull();
    expect(storedFiles()).toHaveLength(1);
    expect((await download(ids[0]!, student.cookie)).status).toBe(200);
  });

  it('US-29 sc.3 uploading to a task in review is 409 RESULT_LOCKED too', async () => {
    const task = await activeTask({ status: 'in_review' });
    await addVersion(task.id, { status: 'submitted' });

    const res = await upload(task.id, student.cookie, 'late.pdf');

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('RESULT_LOCKED');
    expect(await prisma.resultFile.count()).toBe(1);
  });

  it('US-29 sc.3 end to end: after a real submit the file can no longer be deleted or added', async () => {
    const task = await activeTask();
    const id = (await upload(task.id, student.cookie)).body.result.files[0].id as string;
    expect((await submit(task.id, student.cookie)).status).toBe(200);

    const removed = await remove(task.id, id, student.cookie);
    const added = await upload(task.id, student.cookie, 'late.pdf');

    expect(removed.body.error.code).toBe('RESULT_LOCKED');
    expect(added.body.error.code).toBe('RESULT_LOCKED');
    expect((await readResult(task.id, student.cookie)).body.result.files).toHaveLength(1);
  });

  it('INV-16 a submitted version is never changed, even if the task still looks editable: 409 RESULT_LOCKED', async () => {
    const task = await activeTask();
    const { ids } = await addVersion(task.id, { status: 'submitted' });

    const res = await remove(task.id, ids[0]!, student.cookie);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('RESULT_LOCKED');
    expect(await prisma.resultFile.count()).toBe(1);
  });

  it('INV-16 a returned version is never changed either: its file cannot be deleted in revision, the new draft can', async () => {
    const task = await activeTask({ status: 'revision' });
    const returned = await addVersion(task.id, { version: 1, status: 'returned' });
    const draft = await addVersion(task.id, { version: 2, status: 'draft' });

    const locked = await remove(task.id, returned.ids[0]!, student.cookie);
    const ok = await remove(task.id, draft.ids[0]!, student.cookie);

    expect(locked.status).toBe(409);
    expect(locked.body.error.code).toBe('RESULT_LOCKED');
    expect(ok.status).toBe(204);
    expect(await prisma.resultFile.count({ where: { resultVersionId: returned.version.id } })).toBe(1);
    expect(await prisma.resultFile.count({ where: { resultVersionId: draft.version.id } })).toBe(0);
  });

  it.each(['done', 'cancelled'])('a %s task gives 409 INVALID_TRANSITION and the file stays', async (status) => {
    const task = await activeTask({ status });
    const { ids } = await addVersion(task.id, { status: 'accepted' });

    const res = await remove(task.id, ids[0]!, student.cookie);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
    expect(await prisma.resultFile.count()).toBe(1);
  });
});

describe('Deleting a file of the draft (US-29)', () => {
  it('US-29 the executor deletes a file: 204, it leaves the list, the download is 404, the row is marked and the bytes are gone', async () => {
    const task = await activeTask();
    const first = (await upload(task.id, student.cookie, 'a.pdf')).body.result.files[0].id as string;
    const second = (await upload(task.id, student.cookie, 'b.pdf', pdf(300))).body.result.files[1].id as string;
    expect(storedFiles()).toHaveLength(2);

    const res = await remove(task.id, first, student.cookie);

    expect(res.status).toBe(204);
    expect(res.text).toBe('');
    const result = (await readResult(task.id, student.cookie)).body.result;
    expect(result.files.map((file: { id: string }) => file.id)).toEqual([second]);
    expect((await download(first, student.cookie)).status).toBe(404);
    expect((await download(second, student.cookie)).status).toBe(200);
    const row = await prisma.file.findUniqueOrThrow({ where: { id: first } });
    expect(row.deletedAt).not.toBeNull(); // the row stays, marked deleted
    expect(await prisma.resultFile.count({ where: { fileId: first } })).toBe(0);
    expect(storedFiles()).toHaveLength(1);
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe('in_progress');
  });

  it('a second delete of the same file is 404 NOT_FOUND and changes nothing', async () => {
    const task = await activeTask();
    const id = (await upload(task.id, student.cookie)).body.result.files[0].id as string;
    expect((await remove(task.id, id, student.cookie)).status).toBe(204);

    const again = await remove(task.id, id, student.cookie);

    expect(again.status).toBe(404);
    expect(again.body.error.code).toBe('NOT_FOUND');
  });

  it('a deleted file frees its place in the limit of ten', async () => {
    const task = await activeTask();
    const ids: string[] = [];
    for (let i = 0; i < LIMITS.resultFilesMax; i += 1) ids.push((await upload(task.id, student.cookie, `f${i}.pdf`, pdf(100 + i))).body.result.files[i].id as string);
    expect((await upload(task.id, student.cookie, 'over.pdf', pdf(900))).body.error.code).toBe('TOO_MANY_FILES');

    expect((await remove(task.id, ids[0]!, student.cookie)).status).toBe(204);

    expect((await upload(task.id, student.cookie, 'again.pdf', pdf(901))).status).toBe(201);
    expect(await prisma.resultFile.count()).toBe(LIMITS.resultFilesMax);
  });

  it('after the last file is deleted the draft stays: a submit is 409 NO_RESULT_FILES, a new upload makes it possible again (INV-15)', async () => {
    const task = await activeTask();
    const id = (await upload(task.id, student.cookie)).body.result.files[0].id as string;
    expect((await remove(task.id, id, student.cookie)).status).toBe(204);

    const empty = await submit(task.id, student.cookie);
    expect(empty.status).toBe(409);
    expect(empty.body.error.code).toBe('NO_RESULT_FILES');
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe('in_progress');
    expect(await prisma.resultVersion.count()).toBe(1);

    expect((await upload(task.id, student.cookie, 'new.pdf')).status).toBe(201);
    expect((await submit(task.id, student.cookie)).status).toBe(200);
    expect(await prisma.resultVersion.count()).toBe(1); // the same draft was used
  });

  it('a request that carries the cookie without the right Origin is refused: 403 ORIGIN_MISMATCH, the file stays', async () => {
    const task = await activeTask();
    const id = (await upload(task.id, student.cookie)).body.result.files[0].id as string;

    const res = await remove(task.id, id, student.cookie, 'http://evil.example');

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ORIGIN_MISMATCH');
    expect(await prisma.resultFile.count()).toBe(1);
  });
});

describe('Who may delete (INV-14) and which file', () => {
  it('a logged-out caller gets 401', async () => {
    const task = await activeTask();
    const { ids } = await addVersion(task.id);
    expect((await remove(task.id, ids[0]!)).status).toBe(401);
    expect(await prisma.resultFile.count()).toBe(1);
  });

  it("the task's customer, an unrelated student and an unrelated customer get 403 NOT_EXECUTOR: the file stays", async () => {
    const task = await activeTask();
    const { ids } = await addVersion(task.id);
    const stranger = await loginAs('student');
    const otherCustomer = await loginAs('customer');

    for (const who of [customer, stranger, otherCustomer]) {
      const res = await remove(task.id, ids[0]!, who.cookie);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('NOT_EXECUTOR');
    }
    expect(await prisma.resultFile.count()).toBe(1);
    expect(storedFiles()).toHaveLength(1);
  });

  it('the executor of another task cannot delete this task\'s file (403) but can delete their own', async () => {
    const task = await activeTask();
    const { ids } = await addVersion(task.id);
    const other = await loginAs('student');
    const othersTask = await createTask(customer.user.id, { status: 'in_progress', executorId: other.user.id, publishedAt: new Date(), assignedAt: new Date() });
    const mine = (await upload(othersTask.id, other.cookie)).body.result.files[0].id as string;

    expect((await remove(task.id, ids[0]!, other.cookie)).body.error.code).toBe('NOT_EXECUTOR');
    expect((await remove(othersTask.id, mine, other.cookie)).status).toBe(204);
    expect(await prisma.resultFile.count({ where: { fileId: ids[0]! } })).toBe(1);
  });

  it('an unknown task is 404; an unknown file is 404', async () => {
    const task = await activeTask();
    await addVersion(task.id);
    const unknown = '00000000-0000-4000-8000-000000000000';

    expect((await remove(unknown, unknown, student.cookie)).body.error.code).toBe('NOT_FOUND');
    const missing = await remove(task.id, unknown, student.cookie);
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('NOT_FOUND');
  });

  it("a file of another task of the same executor is 404, and that file stays (the other task's files are not revealed)", async () => {
    const task = await activeTask();
    const second = await activeTask();
    const { ids } = await addVersion(second.id);

    const res = await remove(task.id, ids[0]!, student.cookie);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(await prisma.resultFile.count({ where: { fileId: ids[0]! } })).toBe(1);
    expect((await prisma.file.findUniqueOrThrow({ where: { id: ids[0]! } })).deletedAt).toBeNull();
  });
});

describe('Races and rollback (ADR-0007)', () => {
  it('INV-15 a delete of the last file and a submit at the same time never leave a submitted version without a file', async () => {
    const outcomes = new Set<string>();
    for (let round = 0; round < 6; round += 1) {
      const task = await activeTask();
      const { version, ids } = await addVersion(task.id);

      const [removed, sent] = await Promise.all([remove(task.id, ids[0]!, student.cookie), submit(task.id, student.cookie)]);

      const submittedVersion = await prisma.resultVersion.findUniqueOrThrow({ where: { id: version.id } });
      const filesLeft = await prisma.resultFile.count({ where: { resultVersionId: version.id } });
      if (sent.status === 200) {
        // The submit got the lock first: the version is under review with its file, and the delete is refused.
        outcomes.add('submit first');
        expect(removed.status).toBe(409);
        expect(removed.body.error.code).toBe('RESULT_LOCKED');
        expect(submittedVersion.status).toBe('submitted');
        expect(filesLeft).toBe(1);
      } else {
        // The delete got the lock first: the file is gone and the submit finds nothing to send.
        outcomes.add('delete first');
        expect(removed.status).toBe(204);
        expect(sent.status).toBe(409);
        expect(sent.body.error.code).toBe('NO_RESULT_FILES');
        expect(submittedVersion.status).toBe('draft');
        expect(filesLeft).toBe(0);
        expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe('in_progress');
      }
      expect(submittedVersion.status === 'submitted' && filesLeft === 0).toBe(false);
    }
    expect(outcomes.size).toBeGreaterThan(0);
  });

  it('two deletes of the same file at once: one 204 and one 404', async () => {
    const task = await activeTask();
    const { ids } = await addVersion(task.id, { files: 2 });

    const [a, b] = await Promise.all([remove(task.id, ids[0]!, student.cookie), remove(task.id, ids[0]!, student.cookie)]);

    expect([a.status, b.status].sort()).toEqual([204, 404]);
    expect(await prisma.resultFile.count()).toBe(1);
    expect(storedFiles()).toHaveLength(1);
  });

  it('rollback: a failure at the `files` update leaves everything: the link, the unmarked row, the bytes, the download', async () => {
    const task = await activeTask();
    const { ids } = await addVersion(task.id);
    const restore = failFileUpdate();
    let res;
    try {
      res = await remove(task.id, ids[0]!, student.cookie);
    } finally {
      restore();
    }

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(await prisma.resultFile.count({ where: { fileId: ids[0]! } })).toBe(1); // the delete of the link was rolled back
    expect((await prisma.file.findUniqueOrThrow({ where: { id: ids[0]! } })).deletedAt).toBeNull();
    expect(storedFiles()).toHaveLength(1); // the bytes are removed only after a commit
    expect((await download(ids[0]!, student.cookie)).status).toBe(200);
  });

  it('if the bytes cannot be removed after the commit it is logged and the request still succeeds: 204, the file is gone from the list', async () => {
    const task = await activeTask();
    const { ids } = await addVersion(task.id);
    const real = getFileStorage();
    setFileStorage({ ...real, delete: () => Promise.reject(new Error('disk error')) });
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const res = await remove(task.id, ids[0]!, student.cookie);

    expect(res.status).toBe(204);
    expect(logged).toHaveBeenCalledWith(expect.stringContaining(ids[0]!), 'disk error');
    expect(await prisma.resultFile.count()).toBe(0);
    expect((await prisma.file.findUniqueOrThrow({ where: { id: ids[0]! } })).deletedAt).not.toBeNull();
    expect((await readResult(task.id, student.cookie)).body.result.files).toEqual([]);
    expect((await download(ids[0]!, student.cookie)).status).toBe(404); // never served again
    expect(storedFiles()).toHaveLength(1); // the leftover bytes: only logged, no cleanup job yet
  });
});
