import type { Prisma } from '@prisma/client';
import { LIMITS } from '@ctoc/shared';
import { insertExperienceRecord, listExperienceOfStudent } from './repo';

/**
 * US-31, US-37 (INV-18, INV-21). Creates the student's experience record of a task that was just accepted, on the CALLER's
 * transaction: it opens none of its own, so the record commits or rolls back with the accept. The title and the description are
 * copied from the task and the date is the time the task was completed (domain-model.md). Nothing here publishes it: showing it
 * in the profile, its order and the mark «Підтверджено платформою CtoC» are US-37 and US-38. Returns the id of the record.
 */
export async function createExperienceRecord(
  tx: Prisma.TransactionClient,
  record: { studentId: string; taskId: string; title: string; description: string; completedAt: Date },
): Promise<string> {
  return (await insertExperienceRecord(tx, record)).id;
}

/**
 * US-37, US-38. The experience records of a student for the public profile (api.md §4.9), newest first. Read only, so no
 * transaction (ADR-0002 rule 1). The records are never edited: this module has no function that changes one (INV-21, US-38).
 */
export const listExperienceRecords = (studentId: string) => listExperienceOfStudent(studentId, LIMITS.experienceMax);
