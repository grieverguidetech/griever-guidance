import { defineConfig, devices, type ReporterDescription } from '@playwright/test';
import { nxE2EPreset } from '@nx/playwright/preset';
import { workspaceRoot } from '@nx/devkit';

/**
 * E2E runs against a production build of apps/web served by `vite preview`
 * on its own port. It never reuses a running server, so a `pnpm dev:local web` on 5173
 * (or another worktree's run) can't be tested by mistake. The app is
 * offline-first, so no gateway is needed; anything that would reach the
 * network is stubbed in the spec that needs it.
 *
 * Set BASE_URL to run the same specs against a deployed site instead.
 */
const PORT = Number(process.env['E2E_PORT'] ?? 4300);
const baseURL = process.env['BASE_URL'] ?? `http://127.0.0.1:${PORT}`;

const preset = nxE2EPreset(__filename, { testDir: './src' });

export default defineConfig({
  ...preset,
  // In CI, also print each failing test with its error to the job log. The
  // preset's reporters (HTML, blob) only show a count there, and stay for the
  // uploaded artifact.
  reporter: process.env['CI']
    ? [['list'], ...(preset.reporter as ReporterDescription[])]
    : preset.reporter,
  // The editor specs need a flag-on build; they run through playwright.cms.config.ts.
  testIgnore: '**/cms/**',
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
  // Desktop only. Web is the desk planning editor (#385); the phone surface is
  // the mobile app, so the web suite does not cover phone viewports or WebKit.
  projects: [{ name: 'desktop-chrome', use: { ...devices['Desktop Chrome'] } }],
});
