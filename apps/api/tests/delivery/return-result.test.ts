import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { LIMITS } from '@ctoc/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hashSessionId } from '../../src/modules/identity/domain';
import { prisma as appPrisma } from '../../src/platform/db';
import { getFileStorage } from '../../src/platform/ports/file-storage';
import { seedWorkData } from '../../src/seed/dev-work';
import { api } from '../helpers/app';
import { prisma, resetDb } from '../helpers/db';
import { createTask } from '../helpers/factories';

/**
 * US-32 and US-33 (return a result for revision, with a comment), and the resubmission after it (US-48 sc.3 through the real
 * return). These tests go through the real endpoint `POST /api/tasks/:id/return`, on the isolated test database.
 */

const ORIGIN = 'http://localhost:5173';
const UPLOAD_DIR = resolve(process.cwd(), 'data/test-uploads');
const PRICE = 50_000;
const COMMENT = 'Додайте висновки та виправте шапку документа';
const RETURNED_TEXT = (title: string) => `Замовник повернув результат на доопрацювання за завданням «${title}»`;

let counter = 0;
async function loginAs(role: 'student' | 'customer') {
  counter += 1;
  const user = await prisma.user.create({
    data: {
      email: `return${counter}@${role === 'student' ? 'university.edu.ua' : 'company.com'}`,
      passwordHash: 'x',
      displayName: 'Користувач',
      role,
      emailConfirmedAt: new Date(),
      studentVerifiedAt: role === 'student' ? new Date() : null,
    },
  });
  const sid = `return-session-${counter}`;
  await prisma.session.create({ data: { id: hashSessionId(sid), userId: user.id, expiresAt: new Date(Date.now() + 3600_000) } });
  return { user, cookie: `sid=${sid}` };
}

const send = (taskId: string, cookie: string | undefined, body?: unknown) => {
  const req = api().post(`/api/tasks/${taskId}/return`);
  const withCookie = cookie ? req.set('Cookie', cookie).set('Origin', ORIGIN) : req;
  return body === undefined ? withCookie : withCookie.send(body as object);
};
const giveBack = (taskId: string, cookie: string | undefined, comment: unknown = COMMENT) => send(taskId, cookie, { comment });
const accept = (taskId: string, cookie: string) => api().post(`/api/tasks/${taskId}/accept`).set('Cookie', cookie).set('Origin', ORIGIN);
const submit = (taskId: string, cookie: string) => api().post(`/api/tasks/${taskId}/result/submit`).set('Cookie', cookie).set('Origin', ORIGIN);
const upload = (taskId: string, cookie: string, name = 'v2.pdf') =>
  api().post(`/api/tasks/${taskId}/result/files`).set('Cookie', cookie).set('Origin', ORIGIN).attach('file', Buffer.from(`%PDF-1.4\n${name}`), { filename: name, contentType: 'application/pdf' });
const readResult = (taskId: string, cookie: string) => api().get(`/api/tasks/${taskId}/result`).set('Cookie', cookie);
const notificationsOf = (cookie: string) => api().get('/api/me/notifications').set('Cookie', cookie);
const remove = (taskId: string, fileId: string, cookie: string) => api().delete(`/api/tasks/${taskId}/result/files/${fileId}`).set('Cookie', cookie).set('Origin', ORIGIN);

let customer: Awaited<ReturnType<typeof loginAs>>;
let student: Awaited<ReturnType<typeof loginAs>>;

/** A task under review, as the real flow leaves it: the escrow held, the customer's ledger consistent, a submitted version with a file. */
async function reviewTask(options: { taskStatus?: string; versionStatus?: string | null; executor?: boolean } = {}) {
  const task = await createTask(customer.user.id, {
    status: options.taskStatus ?? 'in_review',
    executorId: options.executor === false ? null : student.user.id,
    publishedAt: new Date(),
    assignedAt: new Date(),
    priceKopecks: PRICE,
    commissionBp: 1000,
    commissionKopecks: 5_000,
    netKopecks: 45_000,
  });
  await prisma.escrow.create({ data: { taskId: task.id, customerId: customer.user.id, amountKopecks: PRICE, status: 'held', idempotencyKey: randomUUID() } });
  await prisma.balance.upsert({ where: { ownerId: customer.user.id }, create: { ownerId: customer.user.id, availableKopecks: 0 }, update: {} });
  await prisma.ledgerEntry.createMany({
    data: [
      { ownerId: customer.user.id, kind: 'topup', amountKopecks: PRICE },
      { ownerId: customer.user.id, kind: 'hold', amountKopecks: -PRICE, taskId: task.id },
    ],
  });
  let fileId: string | null = null;
  let versionId: string | null = null;
  if (options.versionStatus !== null) {
    const version = await prisma.resultVersion.create({ data: { taskId: task.id, version: 1, status: options.versionStatus ?? 'submitted', submittedAt: new Date() } });
    versionId = version.id;
    const storageKey = randomUUID();
    await getFileStorage().put(storageKey, Buffer.from('%PDF-1.4\nthe first result'));
    const file = await prisma.file.create({
      data: { ownerId: student.user.id, kind: 'result', storageKey, originalName: 'v1.pdf', mime: 'application/pdf', sizeBytes: 30, sha256: 'h' },
    });
    await prisma.resultFile.create({ data: { resultVersionId: version.id, fileId: file.id } });
    fileId = file.id;
  }
  return { task, fileId, versionId };
}

/** The money and the record of a task: a return must not change any of it. */
const moneySnapshot = async () => ({
  escrows: await prisma.escrow.findMany({ orderBy: { id: 'asc' } }),
  balances: await prisma.balance.findMany({ orderBy: { ownerId: 'asc' } }),
  ledger: await prisma.ledgerEntry.findMany({ orderBy: { id: 'asc' } }),
  experience: await prisma.experienceRecord.count(),
});

/** Everything the return can change. Two equal snapshots mean that nothing changed. */
const snapshot = async () => ({
  ...(await moneySnapshot()),
  tasks: await prisma.task.findMany({ orderBy: { id: 'asc' } }),
  versions: await prisma.resultVersion.findMany({ orderBy: { id: 'asc' } }),
  notifications: await prisma.notification.count(),
});

/** INV-20: every balance equals the sum of its ledger entries. */
async function expectBalancesToEqualLedger() {
  const sums = new Map<string, number>();
  for (const entry of await prisma.ledgerEntry.findMany()) sums.set(entry.ownerId, (sums.get(entry.ownerId) ?? 0) + entry.amountKopecks);
  for (const balance of await prisma.balance.findMany()) expect(balance.availableKopecks, `balance of ${balance.ownerId}`).toBe(sums.get(balance.ownerId) ?? 0);
}

/** The hook of the fault-injection scenarios (W-08): the n-th call of one method of one model throws inside the transaction. */
function failOn(model: string, method: string, nth = 1) {
  const original = appPrisma.$transaction;
  appPrisma.$transaction = ((fn: (tx: object) => unknown, options?: unknown) => {
    let calls = 0;
    return (original as (...a: unknown[]) => unknown).call(
      appPrisma,
      (tx: object) =>
        fn(
          new Proxy(tx, {
            get(target, prop) {
              const value = Reflect.get(target, prop, target) as object;
              if (prop !== model) return value;
              return new Proxy(value, {
                get(delegate, name) {
                  const member = Reflect.get(delegate, name, delegate);
                  if (name !== method) return member;
                  return (...args: unknown[]) => {
                    calls += 1;
                    if (calls === nth) return Promise.reject(new Error('injected failure'));
                    return (member as (...a: unknown[]) => unknown).apply(delegate, args);
                  };
                },
              });
            },
          }),
        ),
      options,
    );
  }) as never;
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

afterEach(() => vi.restoreAllMocks());

describe('Return for revision: US-32 sc.1, US-33 sc.1', () => {
  it('US-32 sc.1 the owner returns it: 200, task in revision, version returned with the comment and the time', async () => {
    const { task, versionId } = await reviewTask();

    const res = await giveBack(task.id, customer.cookie);

    expect(res.status).toBe(200);
    expect(res.body.task).toEqual({ id: task.id, status: 'revision' });
    expect(res.body.result).toMatchObject({ version: 1, status: 'returned', revisionComment: COMMENT });
    expect(res.body.result.lastReturn).toMatchObject({ version: 1, comment: COMMENT });
    expect(res.body.result.lastReturn.returnedAt).toEqual(expect.any(String));
    expect(res.body.result.files).toHaveLength(1);
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe('revision');
    const version = await prisma.resultVersion.findUniqueOrThrow({ where: { id: versionId! } });
    expect(version).toMatchObject({ status: 'returned', revisionComment: COMMENT });
    expect(version.decidedAt).not.toBeNull();
    expect(await prisma.resultVersion.count()).toBe(1); // no new version yet: the student starts it
  });

  it('US-32 sc.1 the comment is trimmed, and only the text is stored', async () => {
    const { task, versionId } = await reviewTask();

    const res = await giveBack(task.id, customer.cookie, `   ${COMMENT}  \n`);

    expect(res.status).toBe(200);
    expect((await prisma.resultVersion.findUniqueOrThrow({ where: { id: versionId! } })).revisionComment).toBe(COMMENT);
  });

  it('US-32 the return changes no money: the escrow stays held, no balance, ledger entry or experience record changes', async () => {
    const { task } = await reviewTask();
    const before = await moneySnapshot();

    await giveBack(task.id, customer.cookie);

    expect(await moneySnapshot()).toEqual(before);
    expect((await prisma.escrow.findUniqueOrThrow({ where: { taskId: task.id } })).status).toBe('held');
    await expectBalancesToEqualLedger();
  });

  it('US-33 the student is told: «Замовник повернув результат на доопрацювання за завданням «[Назва]»», unread, with no comment in it', async () => {
    const { task } = await reviewTask();

    await giveBack(task.id, customer.cookie);

    const res = await notificationsOf(student.cookie);
    expect(res.body.notifications).toHaveLength(1);
    expect(res.body.notifications[0]).toMatchObject({ type: 'result_returned', text: RETURNED_TEXT(task.title), read: false, payload: { taskId: task.id, taskTitle: task.title } });
    expect(JSON.stringify(res.body.notifications)).not.toContain(COMMENT); // the comment is on the card, not in the notification
    expect((await notificationsOf(customer.cookie)).body.notifications).toEqual([]); // only the student is told
  });

  it('US-33 sc.1 the student reads the comment: GET result shows the returned version and lastReturn; the customer sees it too', async () => {
    const { task } = await reviewTask();
    await giveBack(task.id, customer.cookie);

    const asStudent = await readResult(task.id, student.cookie);
    const asCustomer = await readResult(task.id, customer.cookie);

    expect(asStudent.body.result).toMatchObject({ version: 1, status: 'returned', revisionComment: COMMENT });
    expect(asStudent.body.result.lastReturn).toMatchObject({ version: 1, comment: COMMENT });
    expect(asCustomer.body.result).toMatchObject({ status: 'returned', revisionComment: COMMENT });
  });

  it('US-33 sc.1 the comment stays after the student starts the new version, as lastReturn, while the current version has none', async () => {
    const { task } = await reviewTask();
    await giveBack(task.id, customer.cookie);

    const up = await upload(task.id, student.cookie);
    const read = await readResult(task.id, student.cookie);

    expect(up.status).toBe(201);
    expect(up.body.result).toMatchObject({ version: 2, status: 'draft', revisionComment: null });
    expect(up.body.result.lastReturn).toMatchObject({ version: 1, comment: COMMENT }); // the answer of the upload carries it too
    expect(read.body.result).toMatchObject({ version: 2, status: 'draft', revisionComment: null });
    expect(read.body.result.lastReturn).toMatchObject({ version: 1, comment: COMMENT });
  });

  it('lastReturn is only given while the task is in revision: it is null once the new version is sent, and for a task that was never returned', async () => {
    const { task } = await reviewTask();
    expect((await readResult(task.id, student.cookie)).body.result.lastReturn).toBeNull(); // in review, never returned
    await giveBack(task.id, customer.cookie);
    await upload(task.id, student.cookie);

    const sent = await submit(task.id, student.cookie);

    expect(sent.status).toBe(200);
    expect(sent.body.result.lastReturn).toBeNull();
    expect((await readResult(task.id, student.cookie)).body.result.lastReturn).toBeNull();
  });

  it('the student can upload a new version after the return: version 2 as a draft, and the first version stays returned with its file', async () => {
    const { task, versionId } = await reviewTask();
    await giveBack(task.id, customer.cookie);

    expect((await upload(task.id, student.cookie)).status).toBe(201);

    expect(await prisma.resultVersion.count()).toBe(2);
    expect((await prisma.resultVersion.findUniqueOrThrow({ where: { id: versionId! } })).status).toBe('returned');
    expect((await prisma.resultVersion.findFirstOrThrow({ where: { taskId: task.id, version: 2 } })).status).toBe('draft');
  });

  it('INV-16 the files of the returned version cannot be changed or deleted, while the new draft can', async () => {
    const { task, fileId } = await reviewTask();
    await giveBack(task.id, customer.cookie);
    const newFile = (await upload(task.id, student.cookie)).body.result.files[0].id as string;

    const locked = await remove(task.id, fileId!, student.cookie);
    const ok = await remove(task.id, newFile, student.cookie);

    expect(locked.status).toBe(409);
    expect(locked.body.error.code).toBe('RESULT_LOCKED');
    expect(ok.status).toBe(204);
    expect(await prisma.resultFile.count({ where: { fileId: fileId! } })).toBe(1);
  });
});

describe('The resubmission after a return (US-48 sc.3 through the real return)', () => {
  it('US-48 sc.3 submit, return, upload, submit again: the customer gets a second notification for the new version, and one version is under review', async () => {
    const { task } = await reviewTask({ taskStatus: 'in_progress', versionStatus: 'draft' });
    expect((await submit(task.id, student.cookie)).status).toBe(200);
    expect((await giveBack(task.id, customer.cookie)).status).toBe(200);
    expect((await upload(task.id, student.cookie)).status).toBe(201);

    const second = await submit(task.id, student.cookie);

    expect(second.status).toBe(200);
    expect(second.body.result).toMatchObject({ version: 2, status: 'submitted' });
    const notes = (await notificationsOf(customer.cookie)).body.notifications as { type: string; text: string }[];
    expect(notes.filter((n) => n.type === 'result_submitted')).toHaveLength(2);
    expect(notes[0]!.text).toBe(`Студент надіслав результат за завданням «${task.title}» на перевірку`);
    expect(await prisma.resultVersion.count({ where: { status: 'submitted' } })).toBe(1);
    expect(await prisma.resultVersion.count({ where: { status: 'returned' } })).toBe(1);
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe('in_review');
  });

  it('after the return the student cannot send the same version again: without a new file the submit is 409 NO_RESULT_FILES', async () => {
    const { task } = await reviewTask();
    await giveBack(task.id, customer.cookie);

    const res = await submit(task.id, student.cookie);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NO_RESULT_FILES');
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe('revision');
  });
});

describe('The comment is required and limited: US-32 sc.3, US-33 sc.2 and sc.3', () => {
  it.each([
    ['an empty object', {}],
    ['an empty string', { comment: '' }],
    ['only spaces and a line break', { comment: '  \n \t ' }],
  ])('US-32 sc.3 / US-33 sc.2 %s is 400 COMMENT_REQUIRED, «Коментар до доопрацювання є обов\'язковим», and nothing changes', async (_name, body) => {
    const { task } = await reviewTask();
    const before = await snapshot();

    const res = await send(task.id, customer.cookie, body);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('COMMENT_REQUIRED');
    expect(res.body.error.message).toBe("Коментар до доопрацювання є обов'язковим");
    expect(await snapshot()).toEqual(before);
  });

  it('US-32 sc.3 / US-33 sc.2 a request with no body at all is the same: 400 COMMENT_REQUIRED', async () => {
    const { task } = await reviewTask();
    const res = await send(task.id, customer.cookie);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('COMMENT_REQUIRED');
  });

  it.each([
    ['a number', 123],
    ['null', null],
    ['an array', ['a']],
    ['an object', { text: 'a' }],
    ['a boolean', true],
  ])('a comment that is %s is 400 VALIDATION_FAILED and nothing changes', async (_name, comment) => {
    const { task } = await reviewTask();
    const before = await snapshot();

    const res = await giveBack(task.id, customer.cookie, comment);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(await snapshot()).toEqual(before);
  });

  it('US-33 sc.3 a comment of exactly 2000 characters is accepted, one more is 400 COMMENT_TOO_LONG, «Коментар перевищує допустиму довжину»', async () => {
    const first = await reviewTask();
    const ok = await giveBack(first.task.id, customer.cookie, 'а'.repeat(LIMITS.revisionCommentMax));
    expect(ok.status).toBe(200);
    expect((await prisma.resultVersion.findUniqueOrThrow({ where: { id: first.versionId! } })).revisionComment).toHaveLength(2000);

    const second = await reviewTask();
    const before = await snapshot();
    const tooLong = await giveBack(second.task.id, customer.cookie, 'а'.repeat(LIMITS.revisionCommentMax + 1));

    expect(tooLong.status).toBe(400);
    expect(tooLong.body.error.code).toBe('COMMENT_TOO_LONG');
    expect(tooLong.body.error.message).toBe('Коментар перевищує допустиму довжину');
    expect(await snapshot()).toEqual(before);
  });

  it('US-33 sc.3 the limit counts the trimmed text: 2000 characters with spaces around are accepted, and the text is not cut', async () => {
    const { task, versionId } = await reviewTask();
    const comment = `   ${'б'.repeat(LIMITS.revisionCommentMax)}${' '.repeat(100)}`;

    const res = await giveBack(task.id, customer.cookie, comment);

    expect(res.status).toBe(200);
    expect((await prisma.resultVersion.findUniqueOrThrow({ where: { id: versionId! } })).revisionComment).toBe('б'.repeat(LIMITS.revisionCommentMax));
  });

  it('the database is the second line for the length: a returned version with a comment over 2000 characters or an empty one is refused by the CHECK', async () => {
    const { versionId } = await reviewTask();

    await expect(prisma.resultVersion.update({ where: { id: versionId! }, data: { status: 'returned', revisionComment: 'x'.repeat(2001) } })).rejects.toThrow();
    await expect(prisma.resultVersion.update({ where: { id: versionId! }, data: { status: 'returned', revisionComment: '' } })).rejects.toThrow();
    expect((await prisma.resultVersion.findUniqueOrThrow({ where: { id: versionId! } })).status).toBe('submitted');
    // Not tested here, on purpose: a NULL comment. In SQL a CHECK passes when its expression is NULL, so this CHECK does not stop
    // `returned` with no comment; only the application does (the schema and the conditional update). Recorded in overview.md OQ-40.
  });
});

describe('The order of the checks, and who may return (INV-14, INV-17)', () => {
  it('US-32 sc.2 a task that is done is 409 TASK_ALREADY_DONE with a valid comment, and nothing changes (the money stays as paid)', async () => {
    const { task } = await reviewTask();
    expect((await accept(task.id, customer.cookie)).status).toBe(200);
    const before = await snapshot();

    const res = await giveBack(task.id, customer.cookie);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TASK_ALREADY_DONE');
    expect(await snapshot()).toEqual(before);
    expect((await prisma.escrow.findUniqueOrThrow({ where: { taskId: task.id } })).status).toBe('released');
    expect(await prisma.notification.count({ where: { type: 'result_returned' } })).toBe(0);
  });

  it('the order is access, then the comment, then the state: a done task with an empty comment is 400, not 409', async () => {
    const { task } = await reviewTask();
    await accept(task.id, customer.cookie);

    const res = await giveBack(task.id, customer.cookie, '');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('COMMENT_REQUIRED');
  });

  it('a non-owner with an invalid comment is 403, not 400: access is checked before the comment', async () => {
    const { task } = await reviewTask();
    const stranger = await loginAs('customer');

    const res = await giveBack(task.id, stranger.cookie, '');

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NOT_TASK_OWNER');
  });

  it('an unknown task with an invalid comment is 404, not 400', async () => {
    const res = await giveBack('00000000-0000-4000-8000-000000000000', customer.cookie, '');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('anyone but the owner is 403 NOT_TASK_OWNER: another customer, the executor, another student; no session is 401; nothing changes', async () => {
    const { task } = await reviewTask();
    const otherCustomer = await loginAs('customer');
    const stranger = await loginAs('student');
    const before = await snapshot();

    for (const who of [otherCustomer, student, stranger]) {
      const res = await giveBack(task.id, who.cookie);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('NOT_TASK_OWNER');
    }
    expect((await giveBack(task.id, undefined)).status).toBe(401);
    expect(await snapshot()).toEqual(before);
  });

  it('a request with the cookie and without the right Origin is refused: 403 ORIGIN_MISMATCH, nothing changes', async () => {
    const { task } = await reviewTask();
    const before = await snapshot();

    const res = await api().post(`/api/tasks/${task.id}/return`).set('Cookie', customer.cookie).set('Origin', 'http://evil.example').send({ comment: COMMENT });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ORIGIN_MISMATCH');
    expect(await snapshot()).toEqual(before);
  });

  it.each(['in_progress', 'revision', 'published', 'cancelled'])('a task in %s has no result under review: 409 TASK_NOT_IN_REVIEW, nothing changes', async (status) => {
    const { task } = await reviewTask({ taskStatus: status, versionStatus: status === 'revision' ? 'returned' : 'draft' });
    const before = await snapshot();

    const res = await giveBack(task.id, customer.cookie);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TASK_NOT_IN_REVIEW');
    expect(await snapshot()).toEqual(before);
  });

  it('a body cannot set a status, a version or an executor: only the comment is read', async () => {
    const { task } = await reviewTask();

    const res = await send(task.id, customer.cookie, { comment: COMMENT, status: 'done', executorId: customer.user.id, versionStatus: 'accepted' });

    expect(res.status).toBe(200);
    expect(await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).toMatchObject({ status: 'revision', executorId: student.user.id });
  });
});

describe('Concurrency: only one of the competing operations succeeds (ADR-0007)', () => {
  it('INV-17, INV-18 an accept and a return at the same time: exactly one wins, and the money matches the winner (six rounds)', async () => {
    for (let round = 0; round < 6; round += 1) {
      const { task } = await reviewTask();

      const [accepted, returned] = await Promise.all([accept(task.id, customer.cookie), giveBack(task.id, customer.cookie)]);

      const row = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
      expect([accepted.status, returned.status].filter((status) => status === 200)).toHaveLength(1);
      if (accepted.status === 200) {
        expect(returned.status).toBe(409);
        expect(returned.body.error.code).toBe('TASK_ALREADY_DONE');
        expect(row.status).toBe('done');
        expect(await prisma.ledgerEntry.count({ where: { taskId: task.id, kind: 'payout' } })).toBe(1);
        expect(await prisma.notification.count({ where: { type: 'result_returned', payloadJson: { contains: task.id } } })).toBe(0); // not told of a return that did not happen
        expect(await prisma.notification.count({ where: { type: 'result_accepted', payloadJson: { contains: task.id } } })).toBe(1);
      } else {
        expect(returned.status).toBe(200);
        expect(accepted.status).toBe(409);
        expect(accepted.body.error.code).toBe('TASK_NOT_IN_REVIEW');
        expect(row.status).toBe('revision');
        expect(await prisma.ledgerEntry.count({ where: { taskId: task.id, kind: 'payout' } })).toBe(0); // nothing was paid
        expect((await prisma.escrow.findUniqueOrThrow({ where: { taskId: task.id } })).status).toBe('held');
        expect(await prisma.experienceRecord.count({ where: { taskId: task.id } })).toBe(0);
        expect(await prisma.notification.count({ where: { type: 'result_returned', payloadJson: { contains: task.id } } })).toBe(1);
        expect(await prisma.notification.count({ where: { type: 'result_accepted', payloadJson: { contains: task.id } } })).toBe(0); // not told of a payout that did not happen
      }
    }
    // Which side wins is up to the scheduler; both orders are also tested one after the other above.
    await expectBalancesToEqualLedger();
  });

  it('five returns at the same time: one 200 and four 409 TASK_NOT_IN_REVIEW, one notification, one returned version with the first comment', async () => {
    const { task } = await reviewTask();

    const results = await Promise.all(Array.from({ length: 5 }, (_, i) => giveBack(task.id, customer.cookie, `${COMMENT} ${i}`)));

    expect(results.filter((res) => res.status === 200)).toHaveLength(1);
    const refused = results.filter((res) => res.status !== 200);
    expect(refused).toHaveLength(4);
    expect(refused.every((res) => res.status === 409 && res.body.error.code === 'TASK_NOT_IN_REVIEW')).toBe(true);
    expect(await prisma.notification.count({ where: { type: 'result_returned' } })).toBe(1);
    expect(await prisma.resultVersion.count({ where: { status: 'returned' } })).toBe(1);
    const winner = results.find((res) => res.status === 200)!;
    expect((await prisma.resultVersion.findFirstOrThrow({ where: { status: 'returned' } })).revisionComment).toBe(winner.body.result.revisionComment);
  });

  it('a second return of the same task is 409 TASK_NOT_IN_REVIEW and keeps the first comment', async () => {
    const { task, versionId } = await reviewTask();
    expect((await giveBack(task.id, customer.cookie, 'Перший коментар')).status).toBe(200);

    const again = await giveBack(task.id, customer.cookie, 'Другий коментар');

    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('TASK_NOT_IN_REVIEW');
    expect((await prisma.resultVersion.findUniqueOrThrow({ where: { id: versionId! } })).revisionComment).toBe('Перший коментар');
    expect(await prisma.notification.count({ where: { type: 'result_returned' } })).toBe(1);
  });
});

describe('Atomicity: a failure at any step undoes the whole return (INV-23)', () => {
  it.each([
    ['the task (the first write, the lock)', 'task', 'updateMany'],
    ['the version', 'resultVersion', 'updateMany'],
    ['the notification (the last step)', 'notification', 'create'],
  ])('a failure at %s: 500, and the task, the version, the comment and the notifications are as they were', async (_step, model, method) => {
    const { task } = await reviewTask();
    const before = await snapshot();
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const restore = failOn(model, method);
    let res;
    try {
      res = await giveBack(task.id, customer.cookie);
    } finally {
      restore();
    }

    expect(res.status).toBe(500); // the hook was reached: the step really ran inside the transaction
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(res.body.error.message).not.toContain('injected');
    expect(await snapshot()).toEqual(before);
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe('in_review');
    expect(logged).toHaveBeenCalledWith('Unhandled error', expect.objectContaining({ message: 'injected failure' }));
    expect((await giveBack(task.id, customer.cookie)).status).toBe(200); // nothing was left half done
  });

  it('a task in review without a submitted version is a broken invariant: 500, logged by the return, nothing changes', async () => {
    const { task } = await reviewTask({ versionStatus: null });
    const before = await snapshot();
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const res = await giveBack(task.id, customer.cookie);

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(logged).toHaveBeenCalledWith(expect.stringContaining(task.id));
    expect(await snapshot()).toEqual(before);
  });

  it('a task in review without an executor cannot exist: the database refuses it (tasks_executor_required_check), the code guard is a second line', async () => {
    await expect(reviewTask({ executor: false })).rejects.toThrow(/tasks_executor_required_check|CHECK constraint/);
  });
});

describe('Integration: the whole real chain with a return in it (US-25, US-27, US-28, US-32, US-33, US-48, US-31, US-30)', () => {
  it('assign -> upload -> submit -> return -> upload -> submit -> accept: every step is allowed once, the student is paid once, every balance equals its ledger', async () => {
    const passwords = { student: `s-${randomUUID()}`, customer: `c-${randomUUID()}` };
    const seeded = await seedWorkData(prisma, passwords); // the real services: top-up, task, application, assign with the escrow
    const loginCookie = async (email: string, password: string) => {
      const res = await api().post('/api/auth/login').set('Origin', ORIGIN).send({ email, password });
      expect(res.status).toBe(200);
      return String(res.headers['set-cookie']?.[0]).split(';')[0]!;
    };
    const studentCookie = await loginCookie('seed.student@ctoc.local', passwords.student);
    const customerCookie = await loginCookie('seed.customer@ctoc.local', passwords.customer);
    const taskId = seeded.taskId!;

    expect((await upload(taskId, studentCookie, 'first.pdf')).status).toBe(201);
    expect((await submit(taskId, studentCookie)).status).toBe(200);
    // The customer is not satisfied and returns it.
    const returned = await giveBack(taskId, customerCookie);
    expect(returned.status).toBe(200);
    // The student sees the comment, also after starting the second version.
    expect((await readResult(taskId, studentCookie)).body.result.lastReturn.comment).toBe(COMMENT);
    expect((await upload(taskId, studentCookie, 'second.pdf')).status).toBe(201);
    expect((await readResult(taskId, studentCookie)).body.result.lastReturn.comment).toBe(COMMENT);
    expect((await submit(taskId, studentCookie)).status).toBe(200);

    const done = await accept(taskId, customerCookie);

    expect(done.status).toBe(200);
    expect(done.body.payout).toEqual({ grossKopecks: PRICE, commissionKopecks: 5_000, netKopecks: 45_000 });
    expect(await prisma.resultVersion.findMany({ where: { taskId }, orderBy: { version: 'asc' }, select: { version: true, status: true } })).toEqual([
      { version: 1, status: 'returned' },
      { version: 2, status: 'accepted' },
    ]);
    const customerNotes = (await notificationsOf(customerCookie)).body.notifications as { type: string }[];
    expect(customerNotes.filter((n) => n.type === 'result_submitted')).toHaveLength(2);
    const studentNotes = (await notificationsOf(studentCookie)).body.notifications as { type: string }[];
    expect(studentNotes.map((n) => n.type).sort()).toEqual(['executor_selected', 'result_accepted', 'result_returned']);
    expect(await prisma.ledgerEntry.count({ where: { taskId, kind: 'payout' } })).toBe(1);
    expect(await prisma.experienceRecord.count({ where: { taskId } })).toBe(1);
    await expectBalancesToEqualLedger();
    expect((await giveBack(taskId, customerCookie)).body.error.code).toBe('TASK_ALREADY_DONE');
  });
});
