import type { CreateApplicationInput } from '@ctoc/shared';
import { Prisma, type User } from '@prisma/client';
import { ApiError } from '../../errors';
import { prisma } from '../../platform/db';
import { assertTaskOpen, getTask } from '../tasks/service';
import { newApplicationData } from './domain';
import { assertCanApply, assertCanReadMyApplications } from './policy';
import { insertApplication, listApplicationsOfStudent } from './repo';

/**
 * US-18 (and US-19 for the note). `input` is already validated by `validateBody`.
 *
 * 1. Only a verified student (403 STUDENT_NOT_VERIFIED, sc.3). The policy does not look at the task, so the 403 comes
 *    before the 404 by design: it says nothing about whether the task exists (ADR-0006).
 * 2. The task must be in the feed, otherwise 404 NOT_FOUND, so an unpublished task is not leaked (US-14 sc.2).
 * 3. One transaction: the task is still open (409 TASK_NOT_OPEN if it was taken meanwhile), then the insert.
 *    A second application hits the unique (task, student) index, INV-09: 409 ALREADY_APPLIED (sc.2).
 */
export async function createApplication(user: User, taskId: string, input: CreateApplicationInput) {
  assertCanApply(user);
  await getTask(user, taskId); // 404 NOT_FOUND when the task is not open to students

  try {
    return await prisma.$transaction(async (tx) => {
      await assertTaskOpen(tx, taskId);
      return insertApplication(tx, newApplicationData(taskId, user.id, input));
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
