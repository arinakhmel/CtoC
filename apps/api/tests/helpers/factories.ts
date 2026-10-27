import { randomUUID } from 'node:crypto';
import { prisma } from './db';

/** Minimal valid rows for constraint tests. Pass overrides to change any field. */
let counter = 0;
const next = () => (counter += 1);

export function createUser(overrides: Partial<{ email: string; role: string; displayName: string }> = {}) {
  const n = next();
  return prisma.user.create({
    data: {
      email: overrides.email ?? `user${n}@university.edu.ua`,
      passwordHash: 'not-a-real-hash',
      displayName: overrides.displayName ?? `User ${n}`,
      role: overrides.role ?? 'student',
    },
  });
}

export function createTask(customerId: string, overrides: Record<string, unknown> = {}) {
  return prisma.task.create({
    data: {
      customerId,
      title: 'Парсер сайту',
      description: 'Потрібен скрипт, що збирає ціни.',
      priceKopecks: 50_000,
      deadlineAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      status: 'published',
      ...overrides,
    },
  });
}

export function createApplication(taskId: string, studentId: string, overrides: Record<string, unknown> = {}) {
  return prisma.application.create({ data: { taskId, studentId, status: 'sent', ...overrides } });
}

export function createFile(ownerId: string) {
  return prisma.file.create({
    data: {
      ownerId,
      kind: 'student_document',
      storageKey: randomUUID(),
      originalName: 'card.pdf',
      mime: 'application/pdf',
      sizeBytes: 1024,
      sha256: 'abc',
    },
  });
}
