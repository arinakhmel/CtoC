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
