#!/usr/bin/env node
/**
 * Renders the app icons (PWA manifest, Apple touch icon) from public/favicon.svg with the
 * locally installed Edge/Chromium via Playwright, so no image tooling is needed.
 * "Maskable" icons keep the logo inside the central 80% safe zone on a full-bleed background.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'web', 'public');
const svg = readFileSync(join(PUBLIC, 'favicon.svg'), 'utf8');
const ICONS = [
  { file: 'icon-192.png', size: 192, scale: 1 },
  { file: 'icon-512.png', size: 512, scale: 1 },
  { file: 'icon-maskable-512.png', size: 512, scale: 0.7 },
  { file: 'apple-touch-icon.png', size: 180, scale: 0.86 },
];

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'msedge' });
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const { file, size, scale } of ICONS) {
  await page.setViewportSize({ width: size, height: size });
  const inner = Math.round(size * scale);
  await page.setContent(
    `<html><body style="margin:0;background:#05060d;display:grid;place-items:center;width:${size}px;height:${size}px">
      <div style="width:${inner}px;height:${inner}px">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div>
    </body></html>`,
  );
  await page.screenshot({ path: join(PUBLIC, file), omitBackground: false });
  console.log(file);
}
await browser.close();
