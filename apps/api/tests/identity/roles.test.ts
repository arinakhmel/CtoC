import { beforeEach, describe, expect, it } from 'vitest';
import { hashSessionId } from '../../src/modules/identity/domain';
import { api } from '../helpers/app';
import { prisma, resetDb } from '../helpers/db';
import { createTask, createUser } from '../helpers/factories';

const ORIGIN = 'http://localhost:5173';

async function login(role: 'student' | 'customer') {
  const user = await prisma.user.create({
    data: {
      email: `roles-${role}@${role === 'student' ? 'university.edu.ua' : 'company.com'}`,
      passwordHash: 'x',
      displayName: 'Тест Користувач',
      role,
      emailConfirmedAt: new Date(),
      studentVerifiedAt: role === 'student' ? new Date() : null,
    },
  });
  const sid = `roles-${role}`;
  await prisma.session.create({ data: { id: hashSessionId(sid), userId: user.id, expiresAt: new Date(Date.now() + 3600_000) } });
  return { user, cookie: `sid=${sid}` };
}

beforeEach(resetDb);

describe('one account, one role (US-43)', () => {
  it('US-43 sc.2 a confirmed student cannot create a task: 403 ROLE_FORBIDDEN, nothing is stored', async () => {
    const { cookie } = await login('student');
    const res = await api()
      .post('/api/tasks')
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .send({
        title: 'Логотип для кав’ярні',
        description: 'Потрібен простий логотип у двох кольорах.',
        priceKopecks: 40_000,
        deadlineAt: new Date(Date.now() + 7 * 24 * 3600_000).toISOString(),
      });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ROLE_FORBIDDEN');
    expect(await prisma.task.count()).toBe(0);
  });

  it('US-43 sc.2 a customer cannot apply to a task: the same 403 ROLE_FORBIDDEN, no application is stored', async () => {
    const { cookie } = await login('customer');
    const owner = await createUser({ role: 'customer', email: 'owner@company.com' });
    const task = await createTask(owner.id, { publishedAt: new Date() });

    const res = await api().post(`/api/tasks/${task.id}/applications`).set('Cookie', cookie).set('Origin', ORIGIN).send({});

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ROLE_FORBIDDEN');
    expect(await prisma.application.count()).toBe(0);
  });
});
