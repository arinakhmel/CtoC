import { expect, test, type Browser } from '@playwright/test';
import { closeSeed, seedModerator, userWithSession } from './support/finance-seed';
import { API, createTask, uploadVerification, verifyStudent, WEB, type Account } from './support/moderation-api';

/**
 * Journey steps 3 and 5 of overview.md §5 (Epic 7): a moderator checks a student's document (US-39) and a new task (US-40). Each test
 * drives ONE moderator step in the browser; the student, the customer, the document and the task are seeded through the real API
 * with their own sessions, and the outcome is read as the student or the customer sees it.
 */

test.afterAll(closeSeed);

async function pageAs(browser: Browser, account: Account) {
  const context = await browser.newContext();
  await context.addCookies([{ name: 'sid', value: account.sid, url: WEB }]);
  return { page: await context.newPage(), close: () => context.close() };
}

test.describe('Journey moderation: the moderator decides on student documents and new tasks', () => {
  // US-39 sc.1
  test('Journey moderation: the moderator approves the student document and the profile shows the verified badge', async ({ browser, request }) => {
    const student = await userWithSession('student', Date.now());
    const moderator = await seedModerator();
    await uploadVerification(request, student);

    const mod = await pageAs(browser, moderator);
    await mod.page.goto('/mod/verifications');
    const item = mod.page.getByRole('listitem').filter({ hasText: student.email });
    await item.getByRole('button', { name: 'Схвалити' }).click();
    await expect(mod.page.getByRole('main').getByRole('status')).toHaveText('Студента підтверджено.');

    // The state the student sees: the public profile carries the badge.
    const visitor = await pageAs(browser, student);
    await visitor.page.goto(`/u/${student.id}`);
    await expect(visitor.page.getByText('Верифікований студент')).toBeVisible();

    await mod.close();
    await visitor.close();
  });

  // US-40 sc.1
  test('Journey moderation: the moderator publishes a task and the verified student sees it in the feed with the net price', async ({ browser, request }) => {
    const title = `Логотип для кав’ярні ${Date.now()}`;
    const moderator = await seedModerator();
    const student = await userWithSession('student', Date.now());
    await verifyStudent(request, student, moderator);
    const customer = await userWithSession('customer', Date.now());
    await createTask(request, customer, { title, priceKopecks: 100_000 });

    const mod = await pageAs(browser, moderator);
    await mod.page.goto('/mod/tasks');
    await mod.page.getByRole('listitem').filter({ hasText: title }).getByRole('button', { name: 'Опублікувати' }).click();
    await expect(mod.page.getByRole('main').getByRole('status')).toHaveText('Завдання опубліковано.');

    // 1000 UAH with the default rate of 10 % is 900 UAH for the student (US-15).
    const feed = await pageAs(browser, student);
    await feed.page.goto('/feed');
    const card = feed.page.getByRole('article', { name: title });
    await expect(card).toBeVisible();
    await expect(card.getByText('Ви отримаєте (після комісії)')).toBeVisible();
    await expect(card).toContainText(/900 грн/);

    await mod.close();
    await feed.close();
  });

  // US-40 sc.2
  test('Journey moderation: the moderator rejects a task with a reason, it stays out of the feed and the customer reads the reason', async ({ browser, request }) => {
    const title = `Контрольна з економіки ${Date.now()}`;
    const reason = 'Це домашнє завдання, а не комерційне замовлення';
    const moderator = await seedModerator();
    const student = await userWithSession('student', Date.now());
    await verifyStudent(request, student, moderator);
    const customer = await userWithSession('customer', Date.now());
    const taskId = await createTask(request, customer, { title, priceKopecks: 100_000 });

    const mod = await pageAs(browser, moderator);
    await mod.page.goto('/mod/tasks');
    await mod.page.getByRole('listitem').filter({ hasText: title }).getByRole('button', { name: 'Відхилити' }).click();
    await mod.page.getByLabel('Причина для замовника').fill(reason);
    await mod.page.getByRole('button', { name: 'Підтвердити відхилення' }).click();
    await expect(mod.page.getByRole('main').getByRole('status')).toHaveText('Завдання відхилено, замовник отримає причину.');

    // Not in the feed: the student gets 404 for it (the state), and the feed page has no such card.
    const asStudent = await request.get(`${API}/api/tasks/${taskId}`, { headers: { Cookie: `sid=${student.sid}` } });
    expect(asStudent.status()).toBe(404);
    const feed = await pageAs(browser, student);
    await feed.page.goto('/feed');
    // Wait for the loaded feed (a list, or the empty message) before asserting that the card is absent.
    await expect(feed.page.getByRole('list', { name: 'Доступні завдання' }).or(feed.page.getByText('Поки що немає доступних завдань.'))).toBeVisible();
    await expect(feed.page.getByRole('article', { name: title })).toHaveCount(0);

    // The customer's notification carries the reason.
    const owner = await pageAs(browser, customer);
    await owner.page.goto('/notifications');
    await expect(owner.page.getByRole('list', { name: 'Сповіщення' }).getByRole('article', { name: new RegExp(title) })).toContainText(reason);

    await mod.close();
    await feed.close();
    await owner.close();
  });

  // US-39 sc.3
  test('Journey moderation: a student who opens the moderator queue is refused', async ({ browser }) => {
    const student = await userWithSession('student', Date.now());

    const visitor = await pageAs(browser, student);
    await visitor.page.goto('/mod/verifications');
    await expect(visitor.page.getByRole('alert')).toHaveText('Доступ заборонено');

    await visitor.close();
  });
});
