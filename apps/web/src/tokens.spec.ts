import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { colors, fontSerifStack, radius, spacing, toWebThemeCss } from '@griever/tokens';

const read = (name: string) => readFileSync(join(import.meta.dirname, name), 'utf8');

/** @griever/tokens is the source for the web theme; a hand edit or a stale file fails here. */
describe('tokens match the web theme', () => {
  const generated = read('theme.generated.css');

  it('theme.generated.css equals toWebThemeCss of the v1 tokens', () => {
    const header = generated.slice(0, generated.indexOf('@theme {'));
    expect(header).toContain('GENERATED');
    expect(generated.slice(header.length)).toBe(toWebThemeCss({ colors, fontSerifStack, spacing, radius }));
  });

  it('styles.css imports the generated file and declares no token of its own', () => {
    const css = read('styles.css');
    expect(css).toContain("@import './theme.generated.css';");
    expect(css).not.toContain('@theme {');
    expect(css).not.toMatch(/--(space|radius)-[\w-]+:/);
    expect(css).not.toMatch(/--font-serif:|--color-(bg|white|surface|ink|accent[\w-]*|neutral-\d+|success-700):/);
  });
});
