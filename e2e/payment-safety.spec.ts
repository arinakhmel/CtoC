import { expect, test } from '@playwright/test';

test.describe('Journey payment-safety: a visitor reads how the payment works on a phone', () => {
  // The page is read before registration, often on a phone: 390 px wide, with no session.
  test.use({ viewport: { width: 390, height: 844 } });

  // US-04 sc.3
  test('Journey payment-safety: the stages are stacked in one column on a 390 px screen without sideways scroll', async ({ page }) => {
    await page.goto('/payment-safety');

    await expect(page.getByRole('heading', { level: 1, name: 'Оплата та безпека' })).toBeVisible();
    const stages = page.getByRole('list').filter({ has: page.getByRole('heading', { level: 3 }) }).getByRole('listitem');
    await expect(stages).toHaveCount(4);

    // Every stage is inside the viewport and below the previous one (vertical, not side by side, nothing overlaps).
    let previousBottom = -1;
    for (let i = 0; i < 4; i += 1) {
      const box = await stages.nth(i).boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(390);
      expect(box!.y).toBeGreaterThanOrEqual(previousBottom);
      previousBottom = box!.y + box!.height;
    }

    // No horizontal scroll of the whole page.
    const widths = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    expect(widths.client).toBe(390);
    expect(widths.scroll).toBeLessThanOrEqual(widths.client);
  });
});
