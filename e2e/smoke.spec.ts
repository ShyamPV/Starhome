import { expect, test } from '@playwright/test';

test('loads the solar system and reports a Galactic position', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByLabel('3D view of the Milky Way')).toBeVisible();
  await expect(page.getByLabel('Galactic position')).toContainText('Galactic l, b', { timeout: 20_000 });
  await expect(page.getByLabel('Galactic position')).toContainText('Orion Spur');
  expect(errors).toEqual([]);
});

test('search warps to a planet and opens its details', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByLabel('Galactic position')).toBeVisible({ timeout: 20_000 });
  await page.keyboard.press('Control+K');
  await expect(page.getByRole('combobox', { name: 'Search' })).toBeFocused();
  await page.keyboard.type('Mars');
  await expect(page.getByRole('option').first()).toContainText('Mars');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('complementary', { name: 'Mars details' })).toBeVisible();
  await expect(page.getByLabel('Galactic position')).toContainText('Nearest', { timeout: 20_000 });
  await expect(page.getByLabel('Galactic position')).toContainText('Mars', { timeout: 30_000 });
});

test('time controls change the simulation rate', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Faster' }).click();
  await page.getByRole('button', { name: 'Faster' }).click();
  await expect(page.getByText('100×')).toBeVisible();
  await page.getByRole('button', { name: 'Reverse time' }).click();
  await expect(page.getByText('−100×')).toBeVisible();
});
