import { toWebThemeCss } from './css.js';
import { colors, fontSerifStack, radius, spacing } from './index.js';

const input = { colors, fontSerifStack, spacing, radius };

/** Every `--name: value;` declaration inside the block that starts at `opener`. */
function declarations(css: string, opener: string): Record<string, string> {
  const start = css.indexOf(opener);
  expect(start, `${opener} block exists`).toBeGreaterThan(-1);
  const end = css.indexOf('\n}', start);
  const found: Record<string, string> = {};
  for (const match of css.slice(start, end).matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
    found[match[1]] = match[2].trim();
  }
  return found;
}

describe('toWebThemeCss', () => {
  const css = toWebThemeCss(input);

  it('writes every colour and the serif stack into @theme, in key order', () => {
    const theme = declarations(css, '@theme {');
    expect(Object.keys(theme)).toEqual(['--font-serif', ...Object.keys(colors).map((n) => `--color-${n}`)]);
    expect(theme['--font-serif']).toBe(fontSerifStack);
    for (const [name, value] of Object.entries(colors)) {
      expect(theme[`--color-${name}`]).toBe(value);
    }
  });

  it('writes spacing and radius into :root in pixels, in key order', () => {
    const root = declarations(css, ':root {');
    expect(Object.keys(root)).toEqual([
      ...Object.keys(spacing).map((n) => `--space-${n}`),
      ...Object.keys(radius).map((n) => `--radius-${n}`),
    ]);
    for (const [name, value] of Object.entries(spacing)) {
      expect(root[`--space-${name}`]).toBe(`${value}px`);
    }
    for (const [name, value] of Object.entries(radius)) {
      expect(root[`--radius-${name}`]).toBe(`${value}px`);
    }
  });

  it('is deterministic', () => {
    expect(toWebThemeCss(input)).toBe(css);
  });

  it('shows a changed value in the output', () => {
    const changed = toWebThemeCss({ ...input, colors: { ...colors, accent: '#123456' } });
    expect(changed).not.toBe(css);
    expect(declarations(changed, '@theme {')['--color-accent']).toBe('#123456');
    expect(changed).toContain('--color-accent: #123456;');
  });

  it('shows a changed spacing or radius value in the output', () => {
    const changed = toWebThemeCss({ ...input, spacing: { ...spacing, 1: 7 }, radius: { ...radius, sm: 3 } });
    expect(changed).toContain('--space-1: 7px;');
    expect(changed).toContain('--radius-sm: 3px;');
  });
});
