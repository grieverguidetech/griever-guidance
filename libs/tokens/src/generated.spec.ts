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

  it('moves for at most 5 s and draws the footer rule from the divider role', () => {
    // WCAG 2.2.2: motion that lasts more than 5 s needs a pause control.
    expect(v2.recipes.button.primary.settleMs).toBeLessThanOrEqual(5000);
    const page = read('apps/marketing/src/styles/page.css');
    expect(page).toContain('animation: gg-drift var(--gg-settle-ms)');
    expect(page).toContain('border-top: 1px solid var(--gg-divider)');
    expect(page).not.toMatch(/animation:[^;]*\d+(\.\d+)?m?s/);
  });
});
