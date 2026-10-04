import { defineConfig, devices } from '@playwright/test';
import { nxE2EPreset } from '@nx/playwright/preset';
import { workspaceRoot } from '@nx/devkit';

/**
 * E2E runs against a production build of apps/web served by `vite preview`
 * on its own port. It never reuses a running server, so a `pnpm dev` on 5173
 * (or another worktree's run) can't be tested by mistake. The app is
 * offline-first, so no gateway is needed; anything that would reach the
 * network is stubbed in the spec that needs it.
 *
 * Set BASE_URL to run the same specs against a deployed site instead.
 */
const PORT = Number(process.env['E2E_PORT'] ?? 4300);
const baseURL = process.env['BASE_URL'] ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  ...nxE2EPreset(__filename, { testDir: './src' }),
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  webServer: process.env['BASE_URL']
    ? undefined
    : {
        command: `pnpm exec nx run web:build && pnpm exec vite preview --config apps/web/vite.config.mts --host 127.0.0.1 --port ${PORT} --strictPort`,
        url: baseURL,
        reuseExistingServer: false,
        timeout: 180_000,
        cwd: workspaceRoot,
      },
  // The person this is for is on a phone (REQUIREMENTS §1): phone projects
  // are first-class, with WebKit standing in for iPhone Safari.
  projects: [
    { name: 'desktop-chrome', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone-chrome', use: { ...devices['Pixel 7'] } },
    { name: 'phone-safari', use: { ...devices['iPhone 15'] } },
  ],
});
