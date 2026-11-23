/// <reference types="vitest" />
import {
  defaultClientConditions,
  defaultServerConditions,
  mergeConfig,
  type UserConfig,
} from 'vite';

/**
 * Shared Vitest settings for every lib and app in the workspace.
 *
 * Workspace packages export their source under the `@org/source` condition
 * (see each package.json's `exports`). Without it, a test importing
 * `@griever/shared` resolves to `dist/`, which is stale locally and missing
 * on a clean CI checkout — the inferred `test` targets don't build deps first.
 * Tests always run against source.
 */
// Exception: libs/data-aws/vite.config.mts replaces the two `conditions` lists below. The AWS SDK
// v3 `module` export is ES code without file extensions, which Node cannot load, so that lib drops
// the `module` condition (resolve and ssr) and lets Node pick the SDK CommonJS build.
export function vitestConfig(
  environment: 'node' | 'jsdom',
  overrides: UserConfig = {},
): UserConfig {
  const base: UserConfig = {
    resolve: { conditions: ['@org/source', ...defaultClientConditions] },
    ssr: { resolve: { conditions: ['@org/source', ...defaultServerConditions] } },
    test: {
      watch: false,
      globals: true,
      environment,
      include: ['src/**/*.{test,spec}.{ts,tsx}'],
      passWithNoTests: false,
      // #1049: in CI, also write a JUnit file that the "Print unit test failures" step in ci.yml
      // prints. A big failed run once lost its Vitest summary from the job log, so the failure must
      // not depend on that log alone. (Vitest adds its github-actions reporter and job summary by
      // itself on GitHub Actions; Nx's streamed prefixes stop the annotations, the summary still works.)
      ...(process.env.CI
        ? {
            reporters: ['default', 'junit'],
            outputFile: { junit: 'test-output/vitest/junit.xml' },
          }
        : {}),
    },
  };
  return mergeConfig(base, overrides);
}
