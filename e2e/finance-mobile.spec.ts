import { expect, test } from '@playwright/test';
import { closeSeed, seedTasksInReview } from './support/finance-seed';

const API = `http://localhost:${process.env.E2E_API_PORT ?? 3101}`;
const WEB = `http://localhost:${process.env.E2E_WEB_PORT ?? 5174}`;
const ORIGIN = WEB; // the API of the e2e run expects the e2e web app as Origin (APP_URL in playwright.config.ts)

test.afterAll(closeSeed);

test.describe('Journey accept-and-payout: the finance page of the student', () => {
  // The page is read on a phone: 390 px wide.
  test.use({ viewport: { width: 390, height: 844 } });

  // US-34 sc.1, US-35 sc.1, US-35 sc.3
  test('Journey accept-and-payout: after the accept the student sees the balance and all three amounts on a 390 px screen without sideways scroll', async ({ page, request }) => {
    const longTitle = 'Логотип для кав’ярні «Зерно» з довгою назвою завдання, щоб перевірити перенесення тексту на вузькому екрані';
    const seeded = await seedTasksInReview(request, [
      { title: longTitle, priceKopecks: 100_000 }, // 1000 / 100 / 900
      { title: 'Банер з непарними копійками', priceKopecks: 99_999 }, // 999,99 / 100 / 899,99
    ]);

    // The customer accepts both results through the real endpoint: the payout is written there (US-31, US-34).
    for (const taskId of seeded.taskIds) {
      const accepted = await request.post(`${API}/api/tasks/${taskId}/accept`, { headers: { Cookie: `sid=${seeded.customer.sid}`, Origin: ORIGIN } });
      expect(accepted.status()).toBe(200);
    }
    // The state through the API: the balance is the sum of the two net amounts (900 + 899,99 UAH).
    const finance = await request.get(`${API}/api/me/finance`, { headers: { Cookie: `sid=${seeded.student.sid}` } });
    expect((await finance.json()).balance.availableKopecks).toBe(90_000 + 89_999);

    // The browser signs in with the session cookie and opens the page.
    await page.context().addCookies([{ name: 'sid', value: seeded.student.sid, url: WEB }]);
    await page.goto('/me/finance');

    await expect(page.getByRole('region', { name: 'Доступно до виведення' })).toContainText(/1\s799,99 грн/);

    const first = page.getByRole('article', { name: longTitle });
    const second = page.getByRole('article', { name: 'Банер з непарними копійками' });
    for (const [card, total, commission, net] of [
      [first, /1\s000 грн/, /100 грн/, /900 грн/],
      [second, /999,99 грн/, /100 грн/, /899,99 грн/],
    ] as const) {
      for (const [label, value] of [['Загальна сума', total], ['Комісія платформи', commission], ['До отримання', net]] as const) {
        const row = card.locator('div').filter({ has: page.getByText(label, { exact: true }) });
        await expect(row).toBeVisible();
        await expect(row).toContainText(value);
        // The value is fully inside the 390 px viewport, not cut off to the right.
        const box = await row.boundingBox();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(390);
      }
    }

    // No horizontal scroll of the whole page.
    const widths = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    expect(widths.client).toBe(390);
    expect(widths.scroll).toBeLessThanOrEqual(widths.client);
  });
});
