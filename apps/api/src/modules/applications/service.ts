import { randomUUID } from 'node:crypto';
import { LIMITS, type AssignExecutorInput, type CreateApplicationInput } from '@ctoc/shared';
import { Prisma, type User } from '@prisma/client';
import { ApiError } from '../../errors';
import { prisma } from '../../platform/db';
import { getPublicProfiles } from '../identity/service';
import { notifyApplicationReceived, notifyExecutorSelected } from '../notifications/service';
import { getEscrowByKey, holdEscrow } from '../payments/service';
import { assertTaskOpen, assignTask, deleteTask, getTask,
  getTaskOwnerAndTitle, getTaskOwnerView } from
  '../tasks/service';
import { IN_PROGRESS } from '../tasks/domain';
import { newApplicationData } from './domain';
import { assertCanApply, assertCanAssign, assertCanListCandidates, assertCanReadMyApplications, assertOwnsTask } from './policy';
import {
  acceptApplication,
  countRejectedOfTask,
  findAcceptedOfTask,
  findApplicationOfTask,
  insertApplication,
  listApplicationsOfStudent,
  listApplicationsOfTask,
  rejectOtherApplications,
  rejectSentOfTask,
} from './repo';

/**
 * US-18 (and US-19 for the note). `input` is already validated by `validateBody`.
 *
 * 1. Only a verified student (403 STUDENT_NOT_VERIFIED, sc.3). The policy does not look at the task, so the 403 comes
 *    before the 404 by design: it says nothing about whether the task exists (ADR-0006).
 * 2. The task must be in the feed, otherwise 404 NOT_FOUND, so an unpublished task is not leaked (US-14 sc.2).
 * 3. One transaction: the task is still open (409 TASK_NOT_OPEN if it was taken meanwhile), then the insert.
 *    A second application hits the unique (task, student) index, INV-09: 409 ALREADY_APPLIED (sc.2).
 *    US-47: in the same transaction the owner of the task gets the notification `application_received`.
 */
export async function createApplication(user: User, taskId: string, input: CreateApplicationInput) {
  assertCanApply(user);
  await getTask(user, taskId); // 404 NOT_FOUND when the task is not open to students

  try {
    return await prisma.$transaction(async (tx) => {
      await assertTaskOpen(tx, taskId);
      const application = await insertApplication(tx, newApplicationData(taskId, user.id, input));
      // US-47: the owner is told in the same transaction. A duplicate (INV-09) throws above and leaves no notification (sc.2).
      const task = await getTaskOwnerAndTitle(tx, taskId);
      await notifyApplicationReceived(tx, task.customerId, task);
      return application;
    });
  } catch (error) {
    // P2002 is a unique violation. The only unique index on applications is (task, student), INV-09. If another one is added,
    // check `error.meta?.target` here, or this would report ALREADY_APPLIED for it.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ApiError('ALREADY_APPLIED');
    }
    throw error;
  }
}

/**
 * US-20. The student's own applications with their current status, newest first. The status is read as stored: it is
 * changed only by the customer's actions (US-25 assign, reject), never here. Only rows of the caller are read, so
 * there is no other student's data to hide.
 */
export async function getMyApplications(user: User) {
  assertCanReadMyApplications(user);
  return listApplicationsOfStudent(user.id);
}

/**
 * US-24 sc.1, sc.2. The applicants of one task for its owner, oldest first, each with the public profile card of the student
 * (name, the verified flag as it is now, skills, bio). An unknown task and someone else's task are both 404 NOT_FOUND
 * (US-50 sc.2, ADR-0006): the management page of a task does not say that it exists. The cards come ready from the identity
 * service in one batch. Read-only.
 */
export async function getCandidates(user: User, taskId: string) {
  assertCanListCandidates(user);
  const task = await getTaskOwnerView(taskId);
  if (task.customerId !== user.id) throw new ApiError('NOT_FOUND');

  // One more than the cap, to know whether the list was cut (the page says so).
  const found = await listApplicationsOfTask(taskId, LIMITS.candidatesMax + 1);
  const truncated = found.length > LIMITS.candidatesMax;
  const rows = truncated ? found.slice(0, LIMITS.candidatesMax) : found;
  const cards = await getPublicProfiles(rows.map((row) => row.studentId));
  const candidates = rows.flatMap((row) => {
    const student = cards.get(row.studentId);
    return student ? [{ row, student }] : [];
  });
  return { task, candidates, truncated };
}

/**
 * US-50 sc.3 (US-22 sc.2, INV-13, A-14). The owner deletes a task that has no executor: it becomes `cancelled`, leaves the feed,
 * and in the same transaction every `sent` application of it becomes `rejected`. A failure at the second step rolls back the
 * first. The task side (checks, the conditional update, the 409 codes) is `deleteTask` of the tasks service.
 */
export const deleteMyTask = (user: User, taskId: string): Promise<void> =>
  deleteTask(user, taskId, async (tx) => {
    await rejectSentOfTask(tx, taskId, new Date());
  });

export type OwnedTask = Awaited<ReturnType<typeof getTaskOwnerView>>;

/**
 * US-25. The task of an owner's action: an unknown task is 404, someone else's task is 403 NOT_TASK_OWNER. The route runs
 * this as a step of its own, so access is checked before the body (ADR-0006).
 */
export async function resolveOwnedTask(user: User, taskId: string): Promise<OwnedTask> {
  assertCanAssign(user);
  const task = await getTaskOwnerView(taskId);
  assertOwnsTask(task, user);
  return task;
}

/**
 * US-25, US-26 (INV-10, INV-11, INV-12, ADR-0007). The owner selects the executor and the full price is reserved, in ONE
 * transaction that commits or rolls back as a whole:
 *   1. the task: conditional update published -> in_progress with the executor (409 TASK_ALREADY_ASSIGNED / TASK_NOT_OPEN);
 *   2. the chosen application: conditional update sent -> accepted (409 APPLICATION_NOT_PENDING);
 *   3. the escrow: conditional debit of the balance (422 INSUFFICIENT_FUNDS), the escrow `held`, the `hold` ledger entry;
 *   4. every other `sent` application -> rejected;
 *   5. the notification to the student (INV-23).
 * A failure in any step leaves nothing changed (US-21 sc.2, US-26 sc.2). `idempotencyKey` makes a repeat safe: the same key
 * again returns the first result and charges once (US-26 sc.3); without a key the server makes one, so a repeat is then a
 * plain 409 TASK_ALREADY_ASSIGNED. `input` is already validated.
 */
export async function assignExecutor(user: User, task: OwnedTask, input: AssignExecutorInput, idempotencyKey?: string) {
  const key = idempotencyKey ?? randomUUID();

  const earlier = await getEscrowByKey(key);
  if (earlier) return replayAssignment(task.id, earlier);

  const application = await findApplicationOfTask(input.applicationId, task.id);
  if (!application) throw new ApiError('NOT_FOUND');

  try {
    return await prisma.$transaction(async (tx) => {
      const now = new Date();
      await assignTask(tx, task.id, user.id, application.studentId, task.priceKopecks);
      if ((await acceptApplication(tx, application.id, task.id, now)).count === 0) throw new ApiError('APPLICATION_NOT_PENDING');
      const escrow = await holdEscrow(tx, { taskId: task.id, customerId: user.id, amountKopecks: task.priceKopecks, idempotencyKey: key });
      const rejected = await rejectOtherApplications(tx, task.id, application.id, now);
      await notifyExecutorSelected(tx, application.studentId, { id: task.id, title: task.title });
      return {
        task: { id: task.id, status: IN_PROGRESS, executorId: application.studentId, priceKopecks: task.priceKopecks },
        escrow,
        acceptedId: application.id as string | null,
        rejectedCount: rejected.count,
      };
    });
  } catch (error) {
    // Two requests with the same key at once: one commits, the other finds the task taken. It gets the first result.
    if (error instanceof ApiError && error.code === 'TASK_ALREADY_ASSIGNED') {
      const raced = await getEscrowByKey(key);
      if (raced && raced.taskId === task.id) return replayAssignment(task.id, raced);
    }
    // The same key for two tasks at once: the second escrow hits the unique key. Nothing was charged (the transaction rolled
    // back); it is the same 400 as sequential reuse of a key.
    if (isIdempotencyKeyCollision(error)) {
      throw new ApiError('VALIDATION_FAILED', { details: [{ field: 'Idempotency-Key', code: 'VALIDATION_FAILED' }] });
    }
    throw error;
  }
}

/** A unique violation on the idempotency key of the escrow (the database guarantee of ADR-0007 §2). */
function isIdempotencyKeyCollision(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002' && JSON.stringify(error.meta ?? {}).includes('idempotency_key');
}

/** US-26 sc.3. The result of an earlier request with the same key: the current task, the same escrow, no new charge. */
async function replayAssignment(taskId: string, escrow: Awaited<ReturnType<typeof getEscrowByKey>> & object) {
  if (escrow.taskId !== taskId) {
    throw new ApiError('VALIDATION_FAILED', { details: [{ field: 'Idempotency-Key', code: 'VALIDATION_FAILED' }] });
  }
  const task = await getTaskOwnerView(taskId);
  const accepted = await findAcceptedOfTask(taskId);
  return {
    task: { id: task.id, status: task.status, executorId: task.executorId, priceKopecks: task.priceKopecks },
    escrow,
    acceptedId: (accepted?.id ?? null) as string | null,
    rejectedCount: await countRejectedOfTask(taskId),
  };
}
