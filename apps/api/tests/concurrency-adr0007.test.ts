// Reference test for the pattern in docs/adr/0007-concurrency-and-money.md. When the real
// `assign` service exists, its race test replaces this one (testing.md §5).
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { disconnectDb, prisma, resetDb } from './helpers/db';
import { createApplication, createTask, createUser } from './helpers/factories';

beforeEach(resetDb);
afterAll(disconnectDb);

describe('ADR-0007 pattern: conditional updateMany inside one transaction', () => {
  it('US-25 sc.2: when two requests assign two students at once, exactly one wins', async () => {
    const customer = await createUser({ role: 'customer', email: 'owner@company.com' });
    const [a, b] = await Promise.all([createUser(), createUser()]);
    const task = await createTask(customer.id);
    await Promise.all([createApplication(task.id, a.id), createApplication(task.id, b.id)]);

    const assign = (studentId: string) =>
      prisma.$transaction(async (tx) => {
        const moved = await tx.task.updateMany({
          where: { id: task.id, status: 'published', executorId: null },
          data: { status: 'in_progress', executorId: studentId, assignedAt: new Date() },
        });
        if (moved.count === 0) return 'TASK_ALREADY_ASSIGNED' as const;
        await tx.application.updateMany({ where: { taskId: task.id, studentId }, data: { status: 'accepted' } });
        await tx.application.updateMany({ where: { taskId: task.id, NOT: { studentId } }, data: { status: 'rejected' } });
        return 'ok' as const;
      });

    const results = await Promise.all([assign(a.id), assign(b.id), assign(a.id), assign(b.id)]);

    expect(results.filter((r) => r === 'ok')).toHaveLength(1);
    expect(results.filter((r) => r === 'TASK_ALREADY_ASSIGNED')).toHaveLength(3);
    const finalTask = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(finalTask.status).toBe('in_progress');
    expect([a.id, b.id]).toContain(finalTask.executorId);
    expect(await prisma.application.count({ where: { taskId: task.id, status: 'accepted' } })).toBe(1);
    expect(await prisma.application.count({ where: { taskId: task.id, status: 'rejected' } })).toBe(1);
  });
});
