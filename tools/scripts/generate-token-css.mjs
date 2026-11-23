// Writes apps/web/src/theme.generated.css from the built @griever/tokens (run `nx build tokens`
// first; the nx target `tokens:generate-css` does). Plain node, no tsx.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { colors, fontSerifStack, radius, spacing, toGeneratedFile } from '../../libs/tokens/dist/index.js';

const out = join(import.meta.dirname, '../../apps/web/src/theme.generated.css');
writeFileSync(out, toGeneratedFile({ colors, fontSerifStack, spacing, radius }));
console.log(`wrote ${out}`);
