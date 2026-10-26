import { defineConfig } from 'vite';
import { vitestConfig } from '../../vitest.base.mts';

// Components are written for React Native. Tests render them through react-native-web, as the web
// app does, so they check the DOM a person (and a screen reader) gets.
export default defineConfig(
  vitestConfig('jsdom', {
    resolve: { alias: { 'react-native': 'react-native-web' } },
    test: { setupFiles: ['src/test-setup.ts'] },
  }),
);
