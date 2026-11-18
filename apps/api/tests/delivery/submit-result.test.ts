import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { hashSessionId } from '../../src/modules/identity/domain';
import { prisma as appPrisma } from '../../src/platform/db';
import { api } from '../helpers/app';
import { prisma, resetDb } from '../helpers/db';
import { createTask } from '../helpers/factories';

const ORIGIN = 'http://localhost:5173';
const UPLOAD_DIR = resolve(process.cwd(), 'data/test-uploads');

let counter = 0;
async function loginAs(role: 'student' | 'customer') {
  counter += 1;
  const user = await prisma.user.create({
    data: {
      email: `submit${counter}@${role === 'student' ? 'university.edu.ua' : 'company.com'}`,
      passwordHash: 'x',
      displayName: 'Користувач',
      role,
      emailConfirmedAt: new Date(),
      studentVerifiedAt: role === 'student' ? new Date() : null,
    },
  });
  const sid = `submit-session-${counter}`;
  await prisma.session.create({ data: { id: hashSessionId(sid), userId: user.id, expiresAt: new Date(Date.now() + 3600_000) } });
  return { user, cookie: `sid=${sid}` };
}

const submit = (taskId: string, cookie?: string) => {
  const req = api().post(`/api/tasks/${taskId}/result/submit`);
  return cookie ? req.set('Cookie', cookie).set('Origin', ORIGIN) : req;
};
const upload = (taskId: string, cookie: string, name = 'result.pdf') =>
  api()
    .post(`/api/tasks/${taskId}/result/files`)
    .set('Cookie', cookie)
    .set('Origin', ORIGIN)
    .attach('file', Buffer.from('%PDF-1.4\nresult'), { filename: name, contentType: 'application/pdf' });
const notificationsOf = (cookie: string) => api().get('/api/me/notifications').set('Cookie', cookie);

let customer: Awaited<ReturnType<typeof loginAs>>;
let student: Awaited<ReturnType<typeof loginAs>>;
const activeTask = (overrides: Record<string, unknown> = {}) =>
  createTask(customer.user.id, { status: 'in_progress', executorId: student.user.id, publishedAt: new Date(), assignedAt: new Date(), ...overrides });

/** A result version with `files` files, as the upload of US-27 leaves it. */
async function addVersion(taskId: string, ownerId: string, options: { version?: number; status?: string; files?: number } = {}) {
  const version = await prisma.resultVersion.create({
    data: { taskId, version: options.version ?? 1, status: options.status ?? 'draft', ...(options.status === 'returned' ? { revisionComment: 'Додайте висновки' } : {}) },
  });
  for (let i = 0; i < (options.files ?? 1); i += 1) {
    const file = await prisma.file.create({
      data: { ownerId, kind: 'result', storageKey: randomUUID(), originalName: `f${i}.pdf`, mime: 'application/pdf', sizeBytes: 10, sha256: 'h' },
    });
    await prisma.resultFile.create({ data: { resultVersionId: version.id, fileId: file.id } });
  }
  return version;
}

/** The hook for the fault-injection scenarios (traceability W-08): the notification insert of the transaction throws. */
function failNotificationInsert() {
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
  return () => {
    appPrisma.$transaction = original;
  };
}

const expectNothingChanged = async (taskId: string, status: string, versionStatus: string | null) => {
  expect((await prisma.task.findUniqueOrThrow({ where: { id: taskId } })).status).toBe(status);
  expect((await prisma.resultVersion.findFirst({ where: { taskId } }))?.status ?? null).toBe(versionStatus);
  expect(await prisma.notification.count()).toBe(0);
};

beforeEach(async () => {
  await resetDb();
  rmSync(UPLOAD_DIR, { recursive: true, force: true });
  customer = await loginAs('customer');
  student = await loginAs('student');
});

describe('Submit the result: US-28 sc.1', () => {
  it('US-28 sc.1 a task with a draft and a file goes to review: 200, task in_review, version submitted with the time', async () => {
    const task = await activeTask();
    const version = await addVersion(task.id, student.user.id, { files: 2 });

    const res = await submit(task.id, student.cookie);

    expect(res.status).toBe(200);
    expect(res.body.task).toEqual({ id: task.id, status: 'in_review' });
    expect(res.body.result).toMatchObject({ version: 1, status: 'submitted', revisionComment: null });
    expect(res.body.result.submittedAt).toEqual(expect.any(String));
    expect(res.body.result.files).toHaveLength(2);
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe('in_review');
    const row = await prisma.resultVersion.findUniqueOrThrow({ where: { id: version.id } });
    expect(row.status).toBe('submitted');
    expect(row.submittedAt).not.toBeNull();
    expect(await prisma.resultFile.count({ where: { resultVersionId: version.id } })).toBe(2);
  });

  it('US-28 sc.1 end to end: the file uploaded through US-27 is the one that is submitted', async () => {
    const task = await activeTask();
    expect((await upload(task.id, student.cookie, 'Звіт.pdf')).status).toBe(201);

    const res = await submit(task.id, student.cookie);

    expect(res.status).toBe(200);
    expect(res.body.result.files.map((file: { name: string }) => file.name)).toEqual(['Звіт.pdf']);
    expect(res.body.result.status).toBe('submitted');
  });

  it('US-28 sc.1 the customer is told in the same step: one result_submitted notification, none for the student', async () => {
    const task = await activeTask();
    await addVersion(task.id, student.user.id);

    await submit(task.id, student.cookie);

    const rows = await prisma.notification.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: customer.user.id, type: 'result_submitted', readAt: null });
    expect(await notificationsOf(student.cookie).then((res) => res.body.notifications)).toEqual([]);
  });

  it('US-28 sc.1 the chat stays open while the task is in review (INV-22)', async () => {
    const task = await activeTask();
    await addVersion(task.id, student.user.id);
    await submit(task.id, student.cookie);

    const sent = await api().post(`/api/tasks/${task.id}/messages`).set('Cookie', customer.cookie).set('Origin', ORIGIN).send({ body: 'Дякую, дивлюсь' });

    expect(sent.status).toBe(201);
  });

  it('INV-16 after the submit the files are locked: an upload is 409 RESULT_LOCKED and the submitted version is unchanged', async () => {
    const task = await activeTask();
    const version = await addVersion(task.id, student.user.id);
    await submit(task.id, student.cookie);

    const res = await upload(task.id, student.cookie, 'late.pdf');

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('RESULT_LOCKED');
    expect(await prisma.resultFile.count({ where: { resultVersionId: version.id } })).toBe(1);
    expect(await prisma.resultVersion.count()).toBe(1);
  });
});

describe('Submit the result: US-28 sc.2 (nothing to submit)', () => {
  it('US-28 sc.2 no file was uploaded: 409 NO_RESULT_FILES, the task stays in progress, nothing is created', async () => {
    const task = await activeTask();

    const res = await submit(task.id, student.cookie);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NO_RESULT_FILES');
    await expectNothingChanged(task.id, 'in_progress', null);
  });

  it('US-28 sc.2 a draft with no file is the same: 409 NO_RESULT_FILES, the draft stays a draft', async () => {
    const task = await activeTask();
    await addVersion(task.id, student.user.id, { files: 0 });

    const res = await submit(task.id, student.cookie);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NO_RESULT_FILES');
    await expectNothingChanged(task.id, 'in_progress', 'draft');
  });
});

describe('Submit the result: US-28 sc.3 (already in review)', () => {
  it('US-28 sc.3 a second submit is blocked: 409 ALREADY_IN_REVIEW, still one submitted version and one notification', async () => {
    const task = await activeTask();
    await addVersion(task.id, student.user.id);
    expect((await submit(task.id, student.cookie)).status).toBe(200);

    const again = await submit(task.id, student.cookie);

    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ALREADY_IN_REVIEW');
    expect(await prisma.notification.count()).toBe(1);
    expect(await prisma.resultVersion.count({ where: { status: 'submitted' } })).toBe(1);
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe('in_review');
  });

  it('US-28 sc.3 a task that was put in review by someone else is the same: 409 ALREADY_IN_REVIEW', async () => {
    const task = await activeTask({ status: 'in_review' });
    await addVersion(task.id, student.user.id, { status: 'submitted' });

    const res = await submit(task.id, student.cookie);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ALREADY_IN_REVIEW');
    expect(await prisma.notification.count()).toBe(0);
  });

  it('US-28 two submits at once (a double click): one 200 and one 409 ALREADY_IN_REVIEW, one notification, one submitted version', async () => {
    const task = await activeTask();
    await addVersion(task.id, student.user.id);

    const [first, second] = await Promise.all([submit(task.id, student.cookie), submit(task.id, student.cookie)]);

    expect([first.status, second.status].sort()).toEqual([200, 409]);
    const refused = first.status === 409 ? first : second;
    expect(refused.body.error.code).toBe('ALREADY_IN_REVIEW');
    expect(await prisma.notification.count()).toBe(1);
    expect(await prisma.resultVersion.count({ where: { status: 'submitted' } })).toBe(1);
  });
});

describe('Submit the result: rollback (ADR-0007, W-08)', () => {
  it('US-28 a failure at the notification step is 500 INTERNAL_ERROR and nothing is left: task in progress, version still a draft, no notification', async () => {
    const task = await activeTask();
    await addVersion(task.id, student.user.id);
    const restore = failNotificationInsert();
    let res;
    try {
      res = await submit(task.id, student.cookie);
    } finally {
      restore();
    }

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    await expectNothingChanged(task.id, 'in_progress', 'draft');
    expect((await prisma.resultVersion.findFirstOrThrow({ where: { taskId: task.id } })).submittedAt).toBeNull();
  });
});

describe('Submit the result: access (INV-14) and state', () => {
  it('a logged-out caller gets 401', async () => {
    const task = await activeTask();
    expect((await submit(task.id)).status).toBe(401);
  });

  it("INV-14 the task's customer cannot submit: 403 NOT_EXECUTOR, nothing changes", async () => {
    const task = await activeTask();
    await addVersion(task.id, student.user.id);

    const res = await submit(task.id, customer.cookie);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NOT_EXECUTOR');
    await expectNothingChanged(task.id, 'in_progress', 'draft');
  });

  it('INV-14 an unrelated student and the executor of another task get 403 NOT_EXECUTOR; the other executor can still submit their own', async () => {
    const task = await activeTask();
    await addVersion(task.id, student.user.id);
    const stranger = await loginAs('student');
    const other = await loginAs('student');
    const othersTask = await createTask(customer.user.id, { status: 'in_progress', executorId: other.user.id, publishedAt: new Date(), assignedAt: new Date() });
    await addVersion(othersTask.id, other.user.id);

    expect((await submit(task.id, stranger.cookie)).body.error.code).toBe('NOT_EXECUTOR');
    expect((await submit(task.id, other.cookie)).body.error.code).toBe('NOT_EXECUTOR');
    await expectNothingChanged(task.id, 'in_progress', 'draft');
    expect((await submit(othersTask.id, other.cookie)).status).toBe(200);
  });

  it('a task nobody was chosen for gives 403 NOT_EXECUTOR, an unknown task 404 NOT_FOUND', async () => {
    const open = await createTask(customer.user.id, { status: 'published', publishedAt: new Date() });

    expect((await submit(open.id, student.cookie)).body.error.code).toBe('NOT_EXECUTOR');
    const unknown = await submit('00000000-0000-4000-8000-000000000000', student.cookie);
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.code).toBe('NOT_FOUND');
  });

  it.each(['done', 'cancelled'])('a %s task cannot be submitted: 409 INVALID_TRANSITION, nothing changes', async (status) => {
    const task = await activeTask({ status });

    const res = await submit(task.id, student.cookie);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
    expect(await prisma.notification.count()).toBe(0);
  });

  it('a request body is ignored: nothing in it can set a status or a version', async () => {
    const task = await activeTask();
    await addVersion(task.id, student.user.id);

    const res = await submit(task.id, student.cookie).send({ status: 'done', executorId: customer.user.id, version: 9 });

    expect(res.status).toBe(200);
    const row = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(row).toMatchObject({ status: 'in_review', executorId: student.user.id });
  });
});

describe('Submit the result after a revision (US-48 sc.3)', () => {
  /** What the return of US-32 leaves: the task in `revision`, the first version `returned`, a new draft with a file. */
  async function inRevisionWithNewDraft() {
    const task = await activeTask({ status: 'revision' });
    await addVersion(task.id, student.user.id, { version: 1, status: 'returned' });
    await addVersion(task.id, student.user.id, { version: 2, status: 'draft' });
    return task;
  }

  it('US-28 the new version is submitted: 200, version 2 submitted, version 1 stays returned, task in_review', async () => {
    const task = await inRevisionWithNewDraft();

    const res = await submit(task.id, student.cookie);

    expect(res.status).toBe(200);
    expect(res.body.result).toMatchObject({ version: 2, status: 'submitted' });
    expect((await prisma.resultVersion.findFirstOrThrow({ where: { taskId: task.id, version: 1 } })).status).toBe('returned');
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe('in_review');
  });

  it('US-28 without a new file the revision cannot be sent again: 409 NO_RESULT_FILES, the task stays in revision', async () => {
    const task = await activeTask({ status: 'revision' });
    await addVersion(task.id, student.user.id, { version: 1, status: 'returned' });

    const res = await submit(task.id, student.cookie);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NO_RESULT_FILES');
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe('revision');
    expect(await prisma.notification.count()).toBe(0);
  });

  it('US-48 sc.3 the second submit creates a second notification, newest first', async () => {
    const task = await activeTask();
    await addVersion(task.id, student.user.id, { version: 1 });
    expect((await submit(task.id, student.cookie)).status).toBe(200);
    // The customer returns it (US-32, built later): the task goes to revision and the student starts version 2.
    await prisma.task.update({ where: { id: task.id }, data: { status: 'revision' } });
    await prisma.resultVersion.updateMany({ where: { taskId: task.id, version: 1 }, data: { status: 'returned', revisionComment: 'Додайте висновки' } });
    await addVersion(task.id, student.user.id, { version: 2 });

    expect((await submit(task.id, student.cookie)).status).toBe(200);

    const list = await notificationsOf(customer.cookie);
    expect(list.body.notifications).toHaveLength(2);
    expect(list.body.notifications.every((n: { type: string }) => n.type === 'result_submitted')).toBe(true);
    expect(await prisma.resultVersion.count({ where: { status: 'submitted' } })).toBe(1);
  });
});

describe('The notification of the customer (US-48)', () => {
  it('US-48 sc.1 the owner reads «Студент надіслав результат за завданням «Парсер сайту» на перевірку», unread, with the task in the payload', async () => {
    const task = await activeTask();
    await addVersion(task.id, student.user.id);

    await submit(task.id, student.cookie);

    const list = await notificationsOf(customer.cookie);
    expect(list.status).toBe(200);
    expect(list.body.notifications).toHaveLength(1);
    expect(list.body.notifications[0]).toMatchObject({
      type: 'result_submitted',
      text: 'Студент надіслав результат за завданням «Парсер сайту» на перевірку',
      read: false,
      payload: { taskId: task.id, taskTitle: 'Парсер сайту' },
    });
  });

  it('US-48 sc.1 only the owner of that task is notified, not another customer', async () => {
    const task = await activeTask();
    await addVersion(task.id, student.user.id);
    const otherCustomer = await loginAs('customer');

    await submit(task.id, student.cookie);

    expect((await notificationsOf(otherCustomer.cookie)).body.notifications).toEqual([]);
  });

  it('US-48 sc.2 a refused submit (no files) creates no notification for the customer', async () => {
    const task = await activeTask();

    const res = await submit(task.id, student.cookie);

    expect(res.status).toBe(409);
    expect((await notificationsOf(customer.cookie)).body.notifications).toEqual([]);
    expect(await prisma.notification.count()).toBe(0);
  });
});
