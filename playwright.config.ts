import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  use: {
    baseURL: 'http://localhost:5173',
    viewport: { width: 1280, height: 800 },
    // Uses the locally installed Edge so no browser download is needed; swap for
    // `npx playwright install chromium` + channel 'chromium' in CI.
    channel: process.env.PW_CHANNEL ?? 'msedge',
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  },
  webServer: {
    command: 'pnpm --filter @vialactea/web dev --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
  },
});
