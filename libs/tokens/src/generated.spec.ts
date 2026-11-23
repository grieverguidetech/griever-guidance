import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { toMarketingFile, v2 } from './index.js';

const root = join(import.meta.dirname, '../../..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

/** The marketing vars are generated from v2; a stale file or a hand edit fails here. */
describe('apps/marketing tokens.generated.css', () => {
  it('equals toMarketingFile(v2), header included', () => {
    expect(read('apps/marketing/src/styles/tokens.generated.css')).toBe(toMarketingFile(v2));
  });

  it('the page imports the generated file and the page css declares no --gg token', () => {
    expect(read('apps/marketing/src/pages/index.astro')).toContain(
      "import '../styles/tokens.generated.css';",
    );
    expect(read('apps/marketing/src/styles/page.css')).not.toMatch(/--gg-[\w-]+\s*:/);
  });
});
