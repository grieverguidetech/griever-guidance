import { defineConfig, type PluginOption } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

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
          `\n  \x1b[36m\x1b[1m➜  Griever Guidance web is running:\x1b[0m \x1b[36m${url}\x1b[0m\n`,
        );
      };
      server.httpServer?.once('listening', show);
    },
  };
}

export default defineConfig(() => ({
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
