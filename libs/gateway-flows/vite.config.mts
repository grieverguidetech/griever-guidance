import { defineConfig } from 'vite';
import { vitestConfig } from '../../vitest.base.mts';

const config = vitestConfig('node');
// The AWS SDK's "module" export is an ES build without file extensions, which Node cannot load.
// Drop that condition so Node gets the SDK's CommonJS build. Workspace sources still resolve.
config.ssr = { resolve: { conditions: ['@org/source', 'node'] } };
config.resolve = { conditions: ['@org/source', 'node'] };

export default defineConfig(config);
