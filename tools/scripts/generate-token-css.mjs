// Writes apps/web/src/theme.generated.css from the built @griever/tokens (run `nx build tokens`
// first; the nx target `tokens:generate-css` does). Plain node, no tsx.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { colors, fontSerifStack, radius, spacing, toGeneratedFile, toMarketingFile, v2 } from '../../libs/tokens/dist/index.js';

const out = join(import.meta.dirname, '../../apps/web/src/theme.generated.css');
writeFileSync(out, toGeneratedFile({ colors, fontSerifStack, spacing, radius }));
console.log(`wrote ${out}`);

const marketingOut = join(import.meta.dirname, '../../apps/marketing/src/styles/tokens.generated.css');
mkdirSync(dirname(marketingOut), { recursive: true });
writeFileSync(marketingOut, toMarketingFile(v2));
console.log(`wrote ${marketingOut}`);
