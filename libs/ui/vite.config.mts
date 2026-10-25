import { defineConfig } from 'vite';
import { vitestConfig } from '../../vitest.base.mts';

// PROTOTYPE #322: no specs live here; the hub is tested from apps/web and apps/mobile.
export default defineConfig(vitestConfig('jsdom', { test: { passWithNoTests: true } }));
