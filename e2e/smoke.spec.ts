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

test('globular clusters are searchable and flying in names the region', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByLabel('Galactic position')).toBeVisible({ timeout: 20_000 });
  await page.keyboard.press('Control+K');
  await page.keyboard.type('Omega Cen');
  await expect(page.getByRole('option').first()).toContainText('Globular cluster');
  await page.keyboard.press('Enter');
  const panel = page.getByRole('complementary', { name: 'Omega Centauri details' });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('Harris catalogue');
  await expect(panel).toContainText('Extinction from Sun (model)', { timeout: 20_000 });
  await expect(page.getByLabel('Galactic position')).toContainText('Omega Centauri (globular cluster)', { timeout: 45_000 });
});

test('galaxy layers can be toggled', async ({ page }) => {
  await page.goto('/');
  for (const name of ['Dust and extinction', 'Globular clusters', 'Spiral arm labels']) {
    const toggle = page.getByRole('checkbox', { name });
    await expect(toggle).toBeChecked();
    await page.getByText(name).click();
    await expect(toggle).not.toBeChecked();
  }
});
