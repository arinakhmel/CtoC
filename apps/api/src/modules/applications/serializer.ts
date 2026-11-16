import type { Application } from '@prisma/client';

/** api.md §4.3. No price field: the application always carries the customer's fixed price (US-42). */
export const serializeApplication = (application: Pick<Application, 'id' | 'taskId' | 'status' | 'note' | 'createdAt'>) => ({
  id: application.id,
  taskId: application.taskId,
  status: application.status,
  note: application.note,
  createdAt: application.createdAt.toISOString(),
});

type MyApplicationRow = Pick<Application, 'id' | 'taskId' | 'status' | 'note' | 'createdAt'> & {
  task: { id: string; title: string; priceKopecks: number };
};

/** api.md §4.3a. The task is shown as a title, its fixed price and its id for the link. Nothing of the customer. */
export const serializeMyApplication = (application: MyApplicationRow) => ({
  ...serializeApplication(application),
  task: { id: application.task.id, title: application.task.title, priceKopecks: application.task.priceKopecks },
});

/**
/** The public profile card of a student as the identity service returns it (api.md §4.9). */
export interface CandidateStudent {
  id: string;
  displayName: string;
  verified: boolean;
  skills: string[];
  bio: string;
}

/**
 * api.md §4.3d. An applicant as the task owner sees them: the application and the public profile card of the student. No
 * email, role or hash (§4.9). There is no price: the application carries the customer's fixed price (US-42).
 */
export const serializeCandidate = (application: Application, student: CandidateStudent) => ({
  ...serializeApplication(application),
  student: { id: student.id, displayName: student.displayName, verified: student.verified, skills: student.skills, bio: student.bio },
});

export const serializeOwnerTask = (task: { id: string; title: string; status: string; priceKopecks: number }) => ({
  id: task.id,
  title: task.title,
  status: task.status,
  priceKopecks: task.priceKopecks,
});
