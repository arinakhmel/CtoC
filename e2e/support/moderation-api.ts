import { expect, type APIRequestContext } from '@playwright/test';

/**
 * The real endpoints a journey seeds with: a student uploads a document (US-08), a moderator approves it (US-39), a customer posts a
 * task (US-16) and a moderator publishes or rejects it (US-40). Each call carries the session cookie of its own account and the
 * Origin the e2e API expects (APP_URL in playwright.config.ts), and checks the status, so a broken step fails where it happens.
 */
export const API = `http://localhost:${process.env.E2E_API_PORT ?? 3101}`;
export const WEB = `http://localhost:${process.env.E2E_WEB_PORT ?? 5174}`;

export interface Account {
  id: string;
  sid: string;
}

const headers = (account: Account) => ({ Cookie: `sid=${account.sid}`, Origin: WEB });

// A real 1×1 PNG: the API checks the content of the file, not only its name.
const PNG_1X1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64');

/** US-08: the student uploads a document with their own session. */
export async function uploadVerification(request: APIRequestContext, student: Account) {
  const response = await request.post(`${API}/api/me/verification`, {
    headers: headers(student),
    multipart: { file: { name: 'student-card.png', mimeType: 'image/png', buffer: PNG_1X1 } },
  });
  expect(response.status(), 'student uploads the document').toBe(201);
  return ((await response.json()) as { verification: { id: string } }).verification.id;
}

/** US-39: the moderator approves exactly the request the student made (the id of the request, not of the user). */
export async function approveVerification(request: APIRequestContext, moderator: Account, requestId: string) {
  const response = await request.post(`${API}/api/mod/verifications/${requestId}/approve`, { headers: headers(moderator) });
  expect(response.status(), 'moderator approves the request').toBe(200);
}

/** The student uploads, the moderator approves that request: the student is verified the way production does it. */
export async function verifyStudent(request: APIRequestContext, student: Account, moderator: Account) {
  await approveVerification(request, moderator, await uploadVerification(request, student));
}

/** US-16: the customer posts a task, which waits in `pending_moderation`. */
export async function createTask(request: APIRequestContext, customer: Account, task: { title: string; priceKopecks: number; description?: string }) {
  const response = await request.post(`${API}/api/tasks`, {
    headers: headers(customer),
    data: {
      title: task.title,
      description: task.description ?? 'Завдання для перевірки модерації.',
      priceKopecks: task.priceKopecks,
      deadlineAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    },
  });
  expect(response.status(), 'customer creates the task').toBe(201);
  return ((await response.json()) as { task: { id: string } }).task.id;
}

/** US-40 sc.1: the moderator publishes; the commission snapshot is taken here. */
export async function publishTask(request: APIRequestContext, moderator: Account, taskId: string) {
  const response = await request.post(`${API}/api/mod/tasks/${taskId}/publish`, { headers: headers(moderator) });
  expect(response.status(), 'moderator publishes the task').toBe(200);
}
