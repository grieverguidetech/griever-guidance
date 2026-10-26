import { readFileSync } from 'node:fs';
import { colors, fontSerifStack, radius, spacing } from './index.js';

const css = readFileSync(new URL('../../../apps/web/src/styles.css', import.meta.url), 'utf8');

/** Every `--name: value;` declaration inside the block that starts at `opener`. */
function declarations(opener: string): Record<string, string> {
  const start = css.indexOf(opener);
  expect(start, `${opener} block exists`).toBeGreaterThan(-1);
  const end = css.indexOf('\n}', start);
  const found: Record<string, string> = {};
  for (const match of css.slice(start, end).matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
    found[match[1]] = match[2].trim();
  }
  return found;
}

describe('tokens match the web styles', () => {
  const theme = declarations('@theme {');
  const root = declarations(':root {');

  it('has the same colours as @theme, no more and no fewer', () => {
    const fromCss = Object.fromEntries(
      Object.entries(theme)
        .filter(([name]) => name.startsWith('--color-'))
        .map(([name, value]) => [name.replace('--color-', ''), value]),
    );
    expect(colors).toEqual(fromCss);
  });

  it('has the same serif stack as @theme', () => {
    expect(theme['--font-serif']).toBe(fontSerifStack);
  });

  it('has the same spacing as :root', () => {
    const fromCss = Object.fromEntries(
      Object.entries(root)
        .filter(([name]) => name.startsWith('--space-'))
        .map(([name, value]) => [name.replace('--space-', ''), Number.parseInt(value, 10)]),
    );
    expect(spacing).toEqual(fromCss);
  });

  it('has the same radii as :root', () => {
    const fromCss = Object.fromEntries(
      Object.entries(root)
        .filter(([name]) => name.startsWith('--radius-'))
        .map(([name, value]) => [name.replace('--radius-', ''), Number.parseInt(value, 10)]),
    );
    expect(radius).toEqual(fromCss);
  });
});
