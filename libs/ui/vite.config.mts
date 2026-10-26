import { defineConfig } from 'vite';
import { vitestConfig } from '../../vitest.base.mts';

// Components are written for React Native. Tests render them through react-native-web, as the web
// app does, so they check the DOM a person (and a screen reader) gets.
export default defineConfig(
  vitestConfig('jsdom', {
    // .web.tsx files (libs/ui/src/phrasing.web.tsx) win over their native twins.
    resolve: { alias: { 'react-native': 'react-native-web/dist/index.js' }, extensions: ['.web.tsx', '.web.ts', '.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json'], },
    // react-native-web is processed by Vite (its ES build), so the context phrasing.web.tsx imports is the one Text reads.
    test: { setupFiles: ['src/test-setup.ts'], server: { deps: { inline: ['react-native-web'] } } },
  }),
);
