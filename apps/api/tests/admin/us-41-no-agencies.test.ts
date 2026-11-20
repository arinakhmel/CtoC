import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { api } from '../helpers/app';
import { prisma, resetDb } from '../helpers/db';
import { createLoggedInUser, createTask, createVerificationRequest } from '../helpers/factories';

/**
 * US-41: only verified beginner students compete. No endpoint of its own: the rules are US-39 (manual moderation of documents),
 * US-18 (an application needs a verified student) and US-06 (registration is student | customer only).
 * The decisions go through the real moderator endpoints, never through a direct database write.
 */

const ORIGIN = 'http://localhost:5173';
const post = (path: string, cookie?: string) => {
  const req = api().post(path).set('Origin', ORIGIN);
  return cookie ? req.set('Cookie', cookie) : req;
};
const apply = (taskId: string, cookie: string) => post(`/api/tasks/${taskId}/applications`, cookie).send({});

let moderator: Awaited<ReturnType<typeof createLoggedInUser>>;
let taskId: string;

beforeEach(async () => {
  await resetDb();
  rmSync(resolve(process.cwd(), 'data/test-uploads'), { recursive: true, force: true });
  moderator = await createLoggedInUser('moderator');
  const owner = await createLoggedInUser('customer');
  taskId = (await createTask(owner.user.id, { publishedAt: new Date() })).id;
});

describe('US-41: only verified students compete', () => {
  it('US-41 sc.1 a student approved by the moderator applies (201); a student without approval gets 403 STUDENT_NOT_VERIFIED', async () => {
    const approved = await createLoggedInUser('student');
    const request = await createVerificationRequest(approved.user.id);
    const outsider = await createLoggedInUser('student');
    await createVerificationRequest(outsider.user.id); // a document is sent but not decided yet

    expect((await post(`/api/mod/verifications/${request.id}/approve`, moderator.cookie)).status).toBe(200);

    const ok = await apply(taskId, approved.cookie);
    expect(ok.status).toBe(201);
    const blocked = await apply(taskId, outsider.cookie);
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('STUDENT_NOT_VERIFIED');
    const rows = await prisma.application.findMany({ where: { taskId } });
    expect(rows.map((r) => r.studentId)).toEqual([approved.user.id]);
  });

  it('US-41 sc.2 a forged agency document is rejected with a reason: no badge, the application is 403 STUDENT_NOT_VERIFIED', async () => {
    const agent = await createLoggedInUser('student');
    const request = await createVerificationRequest(agent.user.id);

    const res = await post(`/api/mod/verifications/${request.id}/reject`, moderator.cookie).send({ reason: 'Підроблений документ' });
    expect(res.status).toBe(200);
    expect(res.body.verification).toMatchObject({ status: 'rejected', reason: 'Підроблений документ' });

    const blocked = await apply(taskId, agent.cookie);
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('STUDENT_NOT_VERIFIED');
    expect(await prisma.application.count()).toBe(0);
    const profile = await api().get(`/api/profiles/${agent.user.id}`); // public, api.md §4.9
    expect(profile.status).toBe(200);
    expect(profile.body.profile.verified).toBe(false);
  });

  // W-12, decided (OQ-15): only the technical part is automated here. Recognising an agency behind a genuine-looking document
  // is NOT testable by code; it stays a manual review item of the moderator (US-39).
  it('US-41 sc.3 technical rules: a customer cannot apply, nobody registers as moderator, an unverified student cannot apply', async () => {
    const customer = await createLoggedInUser('customer');
    const blocked = await apply(taskId, customer.cookie);
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('ROLE_FORBIDDEN');

    const before = await prisma.user.count();
    const reg = await api()
      .post('/api/auth/register')
      .set('Origin', ORIGIN)
      .send({ role: 'moderator', email: 'agency@university.edu.ua', displayName: 'Агенція', password: 'Str0ng-pass-1!' });
    expect(reg.status).toBe(400);
    expect(reg.body.error.code).toBe('VALIDATION_FAILED');
    expect(await prisma.user.count()).toBe(before);
    expect(await prisma.user.findUnique({ where: { email: 'agency@university.edu.ua' } })).toBeNull();

    const unverified = await createLoggedInUser('student');
    const res = await apply(taskId, unverified.cookie);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('STUDENT_NOT_VERIFIED');
    expect(await prisma.application.count()).toBe(0);
  });
});
