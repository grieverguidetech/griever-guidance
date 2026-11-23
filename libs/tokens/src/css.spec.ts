import {
  block,
  generatedHeader as generatedHeaderText,
  rootLines,
  themeLines,
  toGeneratedFile,
  toMarketingCss,
  toMarketingFile,
  toWebThemeCss,
} from './css.js';
import { colors, fontSerifStack, radius, spacing } from './index.js';
import { v2 } from './v2/index.js';
import { buildRecipes } from './v2/recipes.js';
import { buildRoles } from './v2/roles.js';

const input = { colors, fontSerifStack, spacing, radius };

/** Every `--name: value;` declaration inside the block that starts at `opener`. */
function declarations(css: string, opener: string): Record<string, string> {
  const start = css.indexOf(opener);
  expect(start, `${opener} block exists`).toBeGreaterThan(-1);
  const end = css.indexOf('\n}', start);
  const found: Record<string, string> = {};
  for (const match of css
    .slice(start, end)
    .matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
    found[match[1]] = match[2].trim();
  }
  return found;
}

describe('toWebThemeCss', () => {
  const css = toWebThemeCss(input);

  it('writes every colour and the serif stack into @theme, in key order', () => {
    const theme = declarations(css, '@theme {');
    expect(Object.keys(theme)).toEqual([
      '--font-serif',
      ...Object.keys(colors).map((n) => `--color-${n}`),
    ]);
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
    const changed = toWebThemeCss({
      ...input,
      colors: { ...colors, accent: '#123456' },
    });
    expect(changed).not.toBe(css);
    expect(declarations(changed, '@theme {')['--color-accent']).toBe('#123456');
    expect(changed).toContain('--color-accent: #123456;');
  });

  it('shows a changed spacing or radius value in the output', () => {
    const changed = toWebThemeCss({
      ...input,
      spacing: { ...spacing, 1: 7 },
      radius: { ...radius, sm: 3 },
    });
    expect(changed).toContain('--space-1: 7px;');
    expect(changed).toContain('--radius-sm: 3px;');
  });

  it('puts a blank line between colour families and writes exact text', () => {
    const small = {
      colors: {
        bg: '#111111',
        ink: '#222222',
        'neutral-100': '#333333',
        'accent-100': '#444444',
        'accent-2-100': '#555555',
        'success-700': '#666666',
      },
      fontSerifStack: 'Serif',
      spacing: { 1: 5 },
      radius: { sm: 1 },
    };
    expect(toWebThemeCss(small)).toBe(
      [
        '@theme {',
        '  --font-serif: Serif;',
        '',
        '  --color-bg: #111111;',
        '  --color-ink: #222222;',
        '',
        '  --color-neutral-100: #333333;',
        '',
        '  --color-accent-100: #444444;',
        '',
        '  --color-accent-2-100: #555555;',
        '',
        '  --color-success-700: #666666;',
        '}',
        '',
        ':root {',
        '  --space-1: 5px;',
        '',
        '  --radius-sm: 1px;',
        '}',
        '',
      ].join('\n'),
    );
  });

  it('builds from themeLines, rootLines and block', () => {
    expect(toWebThemeCss(input)).toBe(
      `${block('@theme', themeLines(input))}\n${block(':root', rootLines(input))}`,
    );
  });

  it('toGeneratedFile starts with the do-not-edit header', () => {
    const file = toGeneratedFile(input);
    expect(file.startsWith('/* GENERATED')).toBe(true);
    expect(file.endsWith(css)).toBe(true);
  });
});

describe('toMarketingCss', () => {
  const primitives = v2.primitives;
  const css = toMarketingCss(v2);

  it('is one :root block of --gg-* declarations', () => {
    expect(css.startsWith(':root {\n')).toBe(true);
    const vars = declarations(css, ':root {');
    expect(Object.keys(vars).length).toBeGreaterThan(20);
    for (const name of Object.keys(vars)) {
      expect(name.startsWith('--gg-')).toBe(true);
    }
  });

  it('writes plain colours, CSS gradients at the v2 angle and CSS shadows', () => {
    const vars = declarations(css, ':root {');
    const { colors: c, gradients, shadows } = primitives;
    expect(vars['--gg-page']).toBe(c.page);
    expect(vars['--gg-glow-sun']).toBe(c.glowSun);
    expect(vars['--gg-glow-sky']).toBe(c.glowSky);
    expect(vars['--gg-ink']).toBe(c.ink);
    expect(vars['--gg-heading']).toBe(c.heading);
    expect(vars['--gg-font']).toBe("'Sora'");
    expect(vars['--gg-primary-bg']).toBe(
      `linear-gradient(${gradients.sunset.angle}deg, ${gradients.sunset.stops.join(', ')})`,
    );
    expect(vars['--gg-secondary-bg']).toContain('linear-gradient(120deg, #a5cbe3');
    expect(vars['--gg-primary-text']).toBe(c.primaryText);
    expect(vars['--gg-primary-border']).toBe(`1px solid ${c.primaryBorder}`);
    expect(vars['--gg-primary-shadow']).toBe(`0px 2px 12px ${shadows.sunset.color}`);
    expect(vars['--gg-card-bg']).toBe(c.glassFill);
    expect(vars['--gg-card-border']).toBe(`1px solid ${c.glassBorder}`);
    expect(vars['--gg-card-shadow']).toBe(`0px 1px 9px ${shadows.glass.color}`);
    expect(vars['--gg-card-radius']).toBe('8px');
    expect(vars['--gg-drift-ms']).toBe('9000ms');
  });

  it('is deterministic and toMarketingFile adds the header', () => {
    expect(toMarketingCss(v2)).toBe(css);
    expect(toMarketingFile(v2)).toBe(generatedHeaderText + css);
  });

  it('a primitive change cascades to every var that uses it', () => {
    const p = structuredClone(primitives) as unknown as Parameters<typeof buildRoles>[0];
    p.colors.page = '#010203';
    p.colors.heading = '#0a0b0c';
    p.colors.primaryBorder = '#112233';
    p.gradients.sunset.stops = ['#aaaaaa', '#bbbbbb', '#cccccc'];
    p.radius = 3;
    const roles = buildRoles(p);
    const vars = declarations(toMarketingCss({ roles, recipes: buildRecipes(roles, p) }), ':root {');
    expect(vars['--gg-page']).toBe('#010203');
    expect(vars['--gg-heading']).toBe('#0a0b0c');
    expect(vars['--gg-primary-border']).toBe('1px solid #112233');
    expect(vars['--gg-primary-bg']).toBe('linear-gradient(120deg, #aaaaaa, #bbbbbb, #cccccc)');
    expect(vars['--gg-primary-radius']).toBe('3px');
    expect(vars['--gg-card-radius']).toBe('3px');
  });
});
