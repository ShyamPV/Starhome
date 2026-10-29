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

test('sky view: look up from a chosen place, find a planet, return to the galaxy', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByLabel('Galactic position')).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Sky', exact: true }).click();
  await page.getByRole('button', { name: 'Look up from Earth' }).click();
  await expect(page.getByLabel('Sky position')).toContainText('Looking at', { timeout: 20_000 });
  await page.getByLabel('Observatory presets').selectOption({ label: 'Paranal, Chile' });
  await expect(page.getByLabel('Sky position')).toContainText('24.63° S, 70.40° W');
  await expect(page.getByLabel("Tonight's sky")).toContainText('Galactic centre', { timeout: 30_000 });

  await page.keyboard.press('Control+K');
  await page.keyboard.type('Jupiter');
  await page.keyboard.press('Enter');
  const panel = page.getByRole('complementary', { name: 'Jupiter details' });
  await expect(panel.getByLabel('Where to find it')).toContainText('Constellation', { timeout: 30_000 });
  await expect(panel.getByRole('button', { name: 'Point to it' })).toBeVisible();

  await page.getByRole('button', { name: 'Back to the galaxy' }).click();
  await expect(page.getByLabel('Galactic position')).toBeVisible({ timeout: 20_000 });
});

test('nebulae: search one, see where to find it, toggle the layer', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByLabel('Galactic position')).toBeVisible({ timeout: 20_000 });
  await page.keyboard.press('Control+K');
  await page.keyboard.type('Ring Nebula');
  await expect(page.getByRole('option').first()).toContainText('Planetary nebula');
  await page.keyboard.press('Enter');
  const panel = page.getByRole('complementary', { name: 'Ring Nebula details' });
  await expect(panel).toContainText('Gaia DR3 parallax');
  await expect(panel.getByLabel('Where to find it')).toContainText('Lyra', { timeout: 30_000 });
  await expect(page.getByLabel('Galactic position')).toContainText('Ring Nebula', { timeout: 45_000 });
  const toggle = page.getByRole('checkbox', { name: 'Nebulae' });
  await expect(toggle).toBeChecked();
  await page.getByText('Nebulae', { exact: true }).click();
  await expect(toggle).not.toBeChecked();
});

test('explore: HR diagram and exoplanet catalogue', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByLabel('Galactic position')).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Explore', exact: true }).click();
  await page.getByRole('tab', { name: 'Stars' }).click();
  await expect(page.getByRole('img', { name: /Hertzsprung-Russell diagram/ })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Star catalogue' })).toContainText('Betelgeuse');
  await page.getByRole('tab', { name: 'Exoplanets' }).click();
  await expect(page.getByText(/known by \d{4}/)).toBeVisible({ timeout: 30_000 });
  await page.getByLabel('In the habitable zone (conservative)').check();
  await page.getByLabel('Maximum distance').selectOption({ label: 'Within 50 pc' });
  await expect(page.getByRole('list', { name: 'Exoplanet list' })).toContainText('Proxima Cen b');
  await page.getByRole('button', { name: 'TRAPPIST-1 e', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'TRAPPIST-1 e details' });
  await expect(panel).toContainText('Yes (conservative)');
  await expect(panel).toContainText('artist’s impression');
  await expect(page.getByLabel('Galactic position')).toContainText('TRAPPIST-1 planetary system', { timeout: 45_000 });
});

test('a shared link restores the camera and selection, and the address bar tracks the view', async ({ page }) => {
  await page.goto('/#sel=m42&at=m42&d=3e14&a=0.5,0.2');
  await expect(page.getByRole('complementary', { name: 'Orion Nebula details' })).toBeVisible({ timeout: 20_000 });
  const rig = await page.evaluate(() => {
    const r = (window as unknown as { starhome: { rig: { distance: number; yaw: number; pitch: number } } }).starhome.rig;
    return { d: r.distance, yaw: r.yaw, pitch: r.pitch };
  });
  expect(rig.d).toBeCloseTo(3e14, -9);
  expect(rig.pitch).toBeCloseTo(0.2, 3);
  // The fragment is rewritten from the live view (same anchor, no history entries).
  await expect.poll(() => page.evaluate(() => location.hash), { timeout: 5000 }).toContain('at=m42');
});

test('explore hub: favourites persist, curated lists, tours and surprise', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByLabel('Galactic position')).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Explore', exact: true }).click();
  await expect(page.getByLabel('Featured today')).toBeVisible();
  await page.getByLabel('Search the catalogue').fill('Sirius');
  await page.getByRole('button', { name: 'Add Sirius to favourites' }).click();
  await page.getByRole('tab', { name: /Favourites/ }).click();
  await expect(page.getByRole('list', { name: 'Catalogue results' })).toContainText('Sirius');

  // Kept in IndexedDB across a reload.
  await page.reload();
  await page.getByRole('button', { name: 'Explore', exact: true }).click();
  await page.getByRole('tab', { name: /Favourites/ }).click();
  await expect(page.getByRole('list', { name: 'Catalogue results' })).toContainText('Sirius', { timeout: 10_000 });

  await page.getByRole('tab', { name: 'Most extreme' }).click();
  await expect(page.getByRole('list', { name: 'Catalogue results' })).toContainText('Heaviest stellar black hole');

  await page.getByRole('tab', { name: 'Tours' }).click();
  await page.getByRole('listitem').filter({ hasText: 'Top 10 extreme stars' }).getByRole('button', { name: 'Start tour' }).click();
  const tour = page.getByRole('region', { name: 'Guided tour' });
  await expect(tour).toContainText('The closest star: Proxima Centauri');
  await expect(tour).toContainText('1 / 10');
  await tour.getByRole('button', { name: 'Next stop' }).click();
  await expect(tour).toContainText('2 / 10');
  await expect(page.getByRole('complementary', { name: "Barnard's Star details" })).toBeVisible();
  await tour.getByRole('button', { name: 'End tour' }).click();
  await expect(tour).toBeHidden();

  await page.getByRole('button', { name: 'Surprise me' }).click();
  await expect(page.getByRole('complementary', { name: / details$/ })).toBeVisible();
});

test('solar system: major moons with their orbit accuracy and sources', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByLabel('Galactic position')).toBeVisible({ timeout: 20_000 });
  await page.keyboard.press('Control+K');
  await page.keyboard.type('Titan');
  await expect(page.getByRole('option').first()).toContainText('Moon of Saturn');
  await page.keyboard.press('Enter');
  const titan = page.getByRole('complementary', { name: 'Titan details' });
  await expect(titan).toContainText('Position accuracy');
  await expect(titan).toContainText('JPL Horizons');
  await expect(page.getByLabel('Galactic position')).toContainText('Titan', { timeout: 30_000 });
  await page.keyboard.press('Control+K');
  await page.keyboard.type('Mars');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('complementary', { name: 'Mars details' })).toContainText('Solar System Scope (CC BY 4.0)');
  // Irregular moons take their measured shape; black holes show their companion.
  for (const [q, name, text] of [
    ['Phobos', 'Phobos details', '26.0 × 22.8 × 18.2 km'],
    ['Cygnus X-1', 'Cygnus X-1 details', 'companion star is drawn at its measured size'],
  ] as const) {
    await page.keyboard.press('Control+K');
    await page.keyboard.type(q);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('complementary', { name })).toContainText(text);
  }
  await page.keyboard.press('Escape');
  await expect(page.getByRole('complementary', { name: 'Mars details' })).toBeHidden();
});

test('settings persist across a reload, and ? lists the controls', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const bloom = page.getByRole('checkbox', { name: 'Bloom' });
  await expect(bloom).toBeChecked();
  await page.getByText('Bloom', { exact: true }).click();
  await page.getByRole('button', { name: 'High contrast' }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Bloom' })).not.toBeChecked();
  await expect(page.locator('html')).toHaveClass(/theme-contrast/);
  await page.getByRole('button', { name: 'Reset display settings' }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Bloom' })).toBeChecked();

  await page.keyboard.press('Shift+Slash');
  const dialog = page.getByRole('dialog', { name: 'Controls' });
  await expect(dialog).toContainText('Ctrl/⌘ K');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});
