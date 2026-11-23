// Writes the generated token CSS from the built @griever/tokens (run `nx build tokens` first; the
// nx targets `tokens:generate-css` and `marketing:test` do). Plain node, no tsx.
//   apps/web/src/theme.generated.css               the web theme
//   apps/marketing/src/styles/tokens.generated.css  the marketing --gg-* vars
// With --check it writes nothing and exits 1 when a file on disk differs (stale or hand-edited).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { colors, fontSerifStack, radius, spacing, toGeneratedFile, toMarketingFile, v2 } from '../../libs/tokens/dist/index.js';

const root = join(import.meta.dirname, '../..');
const files = [
  ['apps/web/src/theme.generated.css', toGeneratedFile({ colors, fontSerifStack, spacing, radius })],
  ['apps/marketing/src/styles/tokens.generated.css', toMarketingFile(v2)],
];

const check = process.argv.includes('--check');
let stale = 0;
for (const [path, text] of files) {
  const out = join(root, path);
  if (check) {
    const current = existsSync(out) ? readFileSync(out, 'utf8') : '';
    if (current !== text) {
      console.error(`stale: ${path} differs from libs/tokens. Run: pnpm nx run tokens:generate-css`);
      stale += 1;
    }
    continue;
  }
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, text);
  console.log(`wrote ${out}`);
}
if (check) {
  if (stale > 0) {
    process.exit(1);
  }
  console.log('generated token CSS is current');
}
