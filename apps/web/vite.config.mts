import { defineConfig, type PluginOption } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { vitestConfig } from '../../vitest.base.mts';

const WEB_PORT = 5173;

/** Print a clear, unmissable line with the dev URL once the server is up. */
function announcePort(): PluginOption {
  return {
    name: 'griever-announce-port',
    apply: 'serve',
    configureServer(server) {
      const show = () => {
        const address = server.httpServer?.address();
        const port =
          typeof address === 'object' && address ? address.port : WEB_PORT;
        const url = `http://localhost:${port}/`;
        server.config.logger.info(
          `\n  \x1b[36m\x1b[1m➜  Grievers Guidance web is running:\x1b[0m \x1b[36m${url}\x1b[0m\n`,
        );
      };
      server.httpServer?.once('listening', show);
    },
  };
}

export default defineConfig(() => ({
  ...vitestConfig('jsdom', {
    // Shared components (libs/ui) are written for React Native; on web they render through
    // react-native-web. This alias applies to Vitest, `vite dev` and `vite build` alike.
    resolve: { alias: { 'react-native': 'react-native-web' } },
    test: {
      setupFiles: ['src/test-setup.ts'],
      // #257: the whole-App journeys are CPU-bound (about 1 s alone, 5 to 30 s when
      // check:affected runs every project at once). Fewer workers stop the web specs
      // fighting each other; the longer limit covers the slice that other projects take.
      maxWorkers: 3,
      testTimeout: 20_000,
    },
  }),
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/web',
  server: {
    port: WEB_PORT,
    host: 'localhost',
  },
  preview: {
    port: WEB_PORT,
    host: 'localhost',
  },
  plugins: [react(), tailwindcss(), announcePort()],
  build: {
    outDir: './dist',
    emptyOutDir: true,
    reportCompressedSize: true,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
}));
