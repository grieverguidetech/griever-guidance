import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { colors, fontSerifStack, radius, spacing, toGeneratedFile, v2 } from '@griever/tokens';

const read = (name: string) => readFileSync(join(import.meta.dirname, name), 'utf8');

/** @griever/tokens is the source for the web theme; a hand edit or a stale file fails here. */
describe('tokens match the web theme', () => {
  const generated = read('theme.generated.css');

  it('theme.generated.css equals toGeneratedFile of the v1 and v2 tokens, header included', () => {
    expect(generated).toBe(toGeneratedFile({ colors, fontSerifStack, spacing, radius, v2 }));
  });

  it('styles.css imports the generated file and declares no token of its own', () => {
    const css = read('styles.css');
    expect(css).toContain("@import './theme.generated.css';");
    expect(css).not.toContain('@theme {');
    const names = [
      '--font-serif',
      ...Object.keys(colors).map((name) => `--color-${name}`),
      ...Object.keys(spacing).map((name) => `--space-${name}`),
      ...Object.keys(radius).map((name) => `--radius-${name}`),
    ];
    for (const name of names) {
      expect(css, `${name} is declared in styles.css`).not.toMatch(new RegExp(`${name}\\s*:`));
    }
    // A new family of generated tokens must not be hand-declared either.
    expect(css).not.toMatch(/--(space|radius)-[\w-]+\s*:/);
  });
});
