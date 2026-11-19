import { expect, test } from '@playwright/test';
import { closeSeed, seedModerator, seedTasksInReview } from './support/finance-seed';

/**
 * Journey step 7 of requirements.md §1 (Epic 6): after the customer accepts the result, the student sees the payout and its
 * breakdown (US-34, US-35), asks to withdraw to a Ukrainian card (US-36), a moderator pays it by hand (A-10), and the profile
 * shows the experience record «Підтверджено платформою CtoC» (US-37, US-38). The accounts and the task under review are seeded
 * in the e2e database because verifying a student (US-39) and publishing a task (US-40) have no API yet; every step after that
 * goes through the real endpoints and pages.
 */

const API = `http://localhost:${process.env.E2E_API_PORT ?? 3101}`;
const WEB = `http://localhost:${process.env.E2E_WEB_PORT ?? 5174}`;
const ORIGIN = WEB; // the API of the e2e run expects the e2e web app as Origin (APP_URL in playwright.config.ts)

test.afterAll(closeSeed);

test('Journey payout-and-experience: accept, breakdown, withdrawal to a card, paid by a moderator, confirmed experience in the profile', async ({ browser, request }) => {
  const title = 'Логотип для кав’ярні «Зерно»';
  const seeded = await seedTasksInReview([{ title, priceKopecks: 100_000, commissionKopecks: 10_000 }]);
  const moderator = await seedModerator();

  // The customer accepts through the real endpoint (US-31): the payout and the experience record are written in its transaction.
  const accepted = await request.post(`${API}/api/tasks/${seeded.taskIds[0]}/accept`, { headers: { Cookie: `sid=${seeded.customer.sid}`, Origin: ORIGIN } });
  expect(accepted.status()).toBe(200);

  const studentContext = await browser.newContext();
  await studentContext.addCookies([{ name: 'sid', value: seeded.student.sid, url: WEB }]);
  const student = await studentContext.newPage();

  // US-34 sc.1, US-35 sc.1: 900 UAH is available, and the breakdown is 1000 / 100 / 900.
  await student.goto('/me/finance');
  const balance = student.getByRole('region', { name: 'Доступно до виведення' });
  await expect(balance).toContainText('900 грн');
  const card = student.getByRole('article', { name: title });
  await expect(card).toContainText(/1\s000 грн/);
  await expect(card.locator('div').filter({ has: student.getByText('Комісія платформи', { exact: true }) })).toContainText('100 грн');
  await expect(card.locator('div').filter({ has: student.getByText('До отримання', { exact: true }) })).toContainText('900 грн');

  // US-36 sc.2: a card with a wrong checksum is refused at the field, nothing is sent.
  await student.getByLabel('Сума, грн').fill('500');
  await student.getByLabel('Номер української банківської картки').fill('4111 1111 1111 1112');
  await student.getByRole('button', { name: 'Вивести кошти' }).click();
  await expect(student.getByRole('alert')).toHaveText('Невірний формат української банківської картки');

  // US-36 sc.1: a valid card, «Вивести кошти», then «Підтвердити».
  await student.getByLabel('Номер української банківської картки').fill('4111 1111 1111 1111');
  await student.getByRole('button', { name: 'Вивести кошти' }).click();
  await student.getByRole('group', { name: 'Підтвердження виведення' }).getByRole('button', { name: 'Підтвердити' }).click();
  await expect(student.getByText(/Заявку на виведення 500 грн на картку •••• 1111 створено/)).toBeVisible();
  await expect(balance).toContainText('400 грн');
  const requests = student.getByRole('list', { name: 'Мої заявки на виведення' });
  await expect(requests).toContainText('Статус: Очікує виплати');

  // US-36 sc.3: more than the 400 UAH left is refused with the message of the story.
  await student.getByLabel('Сума, грн').fill('450');
  await student.getByLabel('Номер української банківської картки').fill('4111 1111 1111 1111');
  await student.getByRole('button', { name: 'Вивести кошти' }).click();
  await student.getByRole('button', { name: 'Підтвердити' }).click();
  await expect(student.getByRole('alert')).toHaveText('Недостатньо коштів на балансі для виведення');
  await expect(balance).toContainText('400 грн');

  // A-10: the moderator sees the full card to pay by hand, and marks the request paid.
  const moderatorContext = await browser.newContext();
  await moderatorContext.addCookies([{ name: 'sid', value: moderator.sid, url: WEB }]);
  const mod = await moderatorContext.newPage();
  await mod.goto('/mod/withdrawals');
  const item = mod.getByRole('article', { name: /500 грн для Студент/ });
  await expect(item).toContainText('4111 1111 1111 1111');
  await item.getByRole('button', { name: 'Позначити виплаченою' }).click();
  await expect(mod.getByText('Заявку позначено виплаченою.')).toBeVisible();

  // The student sees the request paid, with only the last four digits.
  await student.reload();
  await expect(requests).toContainText('Статус: Виплачено');
  await expect(student.getByRole('main')).not.toContainText('4111 1111 1111 1111');

  // US-37 sc.1, US-38 sc.1: the public profile has the record, confirmed by the platform, with no control to edit it (sc.2).
  await student.goto(`/u/${seeded.student.id}`);
  const record = student.getByRole('article', { name: title });
  await expect(record).toContainText('Підтверджено платформою CtoC');
  await expect(record).toContainText('Завдання для перевірки сторінки фінансів.');
  const experience = student.getByRole('region', { name: 'Досвід / Резюме' });
  await expect(experience.getByRole('button')).toHaveCount(0);

  await studentContext.close();
  await moderatorContext.close();
});
