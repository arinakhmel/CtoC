import type { Application } from '@prisma/client';

/** api.md §4.3. No price field: the application always carries the customer's fixed price (US-42). */
export const serializeApplication = (application: Pick<Application, 'id' | 'taskId' | 'status' | 'note' | 'createdAt'>) => ({
  id: application.id,
  taskId: application.taskId,
  status: application.status,
  note: application.note,
  createdAt: application.createdAt.toISOString(),
});
