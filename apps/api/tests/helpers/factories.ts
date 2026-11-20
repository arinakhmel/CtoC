import { randomUUID } from 'node:crypto';
import { hashSessionId } from '../../src/modules/identity/domain';
import { getFileStorage } from '../../src/platform/ports/file-storage';
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

/** A user with a confirmed email and a live session. Returns the row and the `Cookie` header value. */
export async function createLoggedInUser(role: 'student' | 'customer' | 'moderator', overrides: Record<string, unknown> = {}) {
  const n = next();
  const user = await prisma.user.create({
    data: {
      email: `login${n}@${role === 'student' ? 'university.edu.ua' : 'ctoc.local'}`,
      passwordHash: 'not-a-real-hash',
      displayName: `Користувач ${n}`,
      role,
      emailConfirmedAt: new Date(),
      ...overrides,
    },
  });
  const sid = `factory-session-${n}`;
  await prisma.session.create({ data: { id: hashSessionId(sid), userId: user.id, expiresAt: new Date(Date.now() + 3600_000) } });
  return { user, cookie: `sid=${sid}` };
}

/** A stored student document with a verification request (status pending by default), as after the upload of US-08. */
export async function createVerificationRequest(userId: string, status = 'pending') {
  const key = `key-${randomUUID()}`;
  const file = await prisma.file.create({
    data: { ownerId: userId, kind: 'student_document', storageKey: key, originalName: 'квиток.pdf', mime: 'application/pdf', sizeBytes: 10, sha256: 'x' },
  });
  await getFileStorage().put(key, Buffer.from('%PDF-1.4 test'));
  return prisma.verificationRequest.create({ data: { userId, fileId: file.id, status } });
}
