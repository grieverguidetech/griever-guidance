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
    },
  };
  return mergeConfig(base, overrides);
}
