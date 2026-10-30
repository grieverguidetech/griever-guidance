import { defineConfig, devices, type ReporterDescription } from '@playwright/test';
import { nxE2EPreset } from '@nx/playwright/preset';
import { workspaceRoot } from '@nx/devkit';

/**
 * E2E for the web editor (#396). The editor is behind VITE_FEATURE_CMS, which is baked in at build
 * time, so this suite needs its own flag-on build. The build goes to apps/web/dist-cms so it never
 * touches the flag-off build in apps/web/dist that playwright.config.ts serves. It has its own port
 * for the same reason. Nx does not infer a target from this file; CI runs it with
 * `pnpm exec playwright test -c apps/web-e2e/playwright.cms.config.ts`.
 *
 * Set BASE_URL to run the same specs against a deployed site (which must have the flag on).
 */
const PORT = Number(process.env['E2E_CMS_PORT'] ?? 4301);
const baseURL = process.env['BASE_URL'] ?? `http://127.0.0.1:${PORT}`;

const preset = nxE2EPreset(__filename, { testDir: './src/cms' });

export default defineConfig({
  ...preset,
  // Separate output so this run does not clear the flag-off run's report and traces.
  outputDir: '../../dist/.playwright/apps/web-e2e/cms-test-output',
  reporter: [
    ...(process.env['CI'] ? ([['list']] as ReporterDescription[]) : []),
    ['html', { outputFolder: '../../dist/.playwright/apps/web-e2e/cms-playwright-report', open: 'never' }],
  ],
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  webServer: process.env['BASE_URL']
    ? undefined
    : {
        command: `VITE_FEATURE_CMS=true pnpm exec vite build --config apps/web/vite.config.mts --outDir dist-cms && pnpm exec vite preview --config apps/web/vite.config.mts --outDir dist-cms --host 127.0.0.1 --port ${PORT} --strictPort`,
        url: baseURL,
        reuseExistingServer: false,
        timeout: 180_000,
        cwd: workspaceRoot,
      },
  // Desktop only (#431): the editor is a desk tool; phone viewports and WebKit are not covered.
  projects: [{ name: 'desktop-chrome', use: { ...devices['Desktop Chrome'] } }],
});
