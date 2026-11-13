import type { CreateApplicationInput } from '@ctoc/shared';
import { Prisma, type User } from '@prisma/client';
import { ApiError } from '../../errors';
import { prisma } from '../../platform/db';
import { assertTaskOpen, getTask } from '../tasks/service';
import { newApplicationData } from './domain';
import { assertCanApply } from './policy';
import { insertApplication } from './repo';

/**
 * US-18 (and US-19 for the note). `input` is already validated by `validateBody`.
 *
 * 1. Only a verified student (403 STUDENT_NOT_VERIFIED, sc.3).
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
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ApiError('ALREADY_APPLIED');
    }
    throw error;
  }
}
