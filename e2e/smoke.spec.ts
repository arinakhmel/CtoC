import { expect, test } from '@playwright/test';

test.describe('smoke journey: the web app, the proxy and the API are wired together', () => {
  test('open /, open «Усі сторінки», see "API: ok"', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: 'Усі сторінки' }).click();
    await expect(page.getByRole('navigation', { name: 'Pages' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Стрічка завдань', exact: true })).toBeVisible();
    await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible();

    // "API: ok" means the browser reached /api/health through the Vite proxy.
    await expect(page.getByRole('status')).toHaveText('API: ok');
  });
});
