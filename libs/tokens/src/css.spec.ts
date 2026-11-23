import {
  block,
  generatedHeader as generatedHeaderText,
  rootLines,
  toGeneratedFile,
  toMarketingCss,
  toMarketingFile,
  toWebThemeCss,
  webEyebrowFontStack,
  webFontStack,
  webHeadingFontStack,
} from './css.js';
import { spacing } from './index.js';
import { v2 } from './v2/index.js';
import { buildRecipes } from './v2/recipes.js';
import { buildRoles } from './v2/roles.js';

const input = { spacing, v2 };

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

  it('writes spacing into :root in pixels, in key order, before the v2 vars', () => {
    const root = declarations(css, ':root {');
    const names = Object.keys(root);
    expect(names.slice(0, Object.keys(spacing).length)).toEqual(
      Object.keys(spacing).map((n) => `--space-${n}`),
    );
    for (const [name, value] of Object.entries(spacing)) {
      expect(root[`--space-${name}`]).toBe(`${value}px`);
    }
    expect(names[Object.keys(spacing).length]).toMatch(/^--v2-/);
  });

  it('puts --space-* in :root only, never in @theme', () => {
    expect(Object.keys(declarations(css, ':root {')).filter((n) => n.startsWith('--space-'))).toHaveLength(
      Object.keys(spacing).length,
    );
    expect(Object.keys(declarations(css, '@theme {')).filter((n) => n.startsWith('--space-'))).toEqual([]);
  });

  it('holds no v1 var: no --radius-*, --font-serif or v1 colour', () => {
    expect(css).not.toMatch(/--radius-|--font-serif/);
    expect(css).not.toMatch(/--color-(accent|neutral|success|surface|bg|white|ink)/);
  });

  it('is deterministic', () => {
    expect(toWebThemeCss(input)).toBe(css);
  });

  it('shows a changed spacing value in the output', () => {
    const changed = toWebThemeCss({ ...input, spacing: { ...spacing, 1: 7 } });
    expect(changed).toContain('--space-1: 7px;');
  });

  it('starts @theme with the v2 font and :root with the rootLines', () => {
    expect(css.startsWith('@theme {\n  --font-v2-heading: ')).toBe(true);
    expect(css).toContain(`:root {\n${rootLines(input).join('\n')}\n\n  --v2-`);
    expect(block('.x', ['  a: b;'])).toBe('.x {\n  a: b;\n}\n');
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
    expect(vars['--gg-font']).toBeUndefined();
    expect(vars['--gg-font-body']).toBe("'Nunito Sans'");
    expect(vars['--gg-font-heading']).toBe("'Fraunces'");
    expect(vars['--gg-heading-soft']).toBe('100');
    expect(vars['--gg-primary-bg']).toBe(
      `linear-gradient(${gradients.sunset.angle}deg, ${gradients.sunset.stops.join(', ')})`,
    );
    expect(vars['--gg-secondary-bg']).toBeUndefined();
    expect(vars['--gg-outline-border']).toBe(`1px solid ${v2.roles.link}`);
    expect(vars['--gg-outline-text']).toBe(v2.roles.link);
    expect(vars['--gg-primary-text']).toBe(c.primaryText);
    expect(vars['--gg-primary-border']).toBe(`1px solid ${c.primaryBorder}`);
    expect(vars['--gg-primary-shadow']).toBe(
      `0px 2px 12px ${shadows.sunset.color}`,
    );
    expect(vars['--gg-card-bg']).toBe(c.glassFill);
    expect(vars['--gg-card-border']).toBe(`1px solid ${c.glassBorder}`);
    expect(vars['--gg-card-shadow']).toBe(`0px 1px 9px ${shadows.glass.color}`);
    expect(vars['--gg-card-radius']).toBe('8px');
    expect(vars['--gg-settle-ms']).toBe('4500ms');
    expect(vars['--gg-divider']).toBe(v2.roles.divider);
    expect(vars['--gg-drift-ms']).toBeUndefined();
  });

  it('is deterministic and toMarketingFile adds the header', () => {
    expect(toMarketingCss(v2)).toBe(css);
    expect(toMarketingFile(v2)).toBe(generatedHeaderText + css);
  });

  it('a primitive change cascades to every var that uses it', () => {
    const p = structuredClone(primitives) as unknown as Parameters<
      typeof buildRoles
    >[0];
    p.colors.page = '#010203';
    p.colors.heading = '#0a0b0c';
    p.colors.primaryBorder = '#112233';
    p.gradients.sunset.stops = ['#aaaaaa', '#bbbbbb', '#cccccc'];
    p.radius = 3;
    const roles = buildRoles(p);
    const vars = declarations(
      toMarketingCss({ roles, recipes: buildRecipes(roles, p) }),
      ':root {',
    );
    expect(vars['--gg-page']).toBe('#010203');
    expect(vars['--gg-heading']).toBe('#0a0b0c');
    expect(vars['--gg-primary-border']).toBe('1px solid #112233');
    expect(vars['--gg-primary-bg']).toBe(
      'linear-gradient(120deg, #aaaaaa, #bbbbbb, #cccccc)',
    );
    expect(vars['--gg-primary-radius']).toBe('3px');
    expect(vars['--gg-card-radius']).toBe('3px');
  });
});

/** The raw `--name` of every declaration in the block at `opener`, repeats included. */
function rawNames(css: string, opener: string): string[] {
  const start = css.indexOf(opener);
  const end = css.indexOf('\n}', start);
  return [...css.slice(start, end).matchAll(/(--[\w-]+)\s*:/g)].map(
    (m) => m[1],
  );
}

/** The names that appear more than once in the list. */
function repeated(names: readonly string[]): string[] {
  return names.filter((n, i) => names.indexOf(n) !== i);
}

describe('toWebThemeCss with v2', () => {
  const css = toWebThemeCss({ ...input, v2 });
  const theme = declarations(css, '@theme {');
  const root = declarations(css, ':root {');

  it('puts colours and the font in @theme, and gradients, shadows, radius and ms in :root', () => {
    expect(theme['--color-v2-error']).toBe('#b3261e');
    expect(theme['--color-v2-success']).toBe('#2a7048');
    expect(theme['--font-v2']).toBeUndefined();
    expect(theme['--font-v2-eyebrow']).toBe(webEyebrowFontStack(v2.primitives, v2.roles.eyebrow.family));
    expect(theme['--font-v2-eyebrow']).toBe(webFontStack(v2.primitives));
    expect(theme['--font-v2-body']).toBe(webFontStack(v2.primitives));
    expect(theme['--font-v2-heading']).toBe(webHeadingFontStack(v2.primitives));
    expect(root['--v2-primary-bg']).toMatch(/^linear-gradient\(120deg, /);
    expect(root['--v2-secondary-bg']).toBeUndefined();
    expect(root['--v2-secondary-shadow']).toBeUndefined();
    expect(root['--v2-card-shadow']).toBe(
      `0px 1px 9px ${v2.primitives.shadows.glass.color}`,
    );
    expect(root['--v2-radius']).toBe('8px');
    expect(root['--v2-settle-ms']).toBe('4500ms');
    expect(root['--v2-drift-ms']).toBe('9000ms');
  });

  it('writes the nudge speckle colours, alpha and orb from the nudge recipe', () => {
    const { speckles, orb } = v2.recipes.nudge;
    expect(speckles.colors).toHaveLength(4);
    speckles.colors.forEach((color, i) => {
      expect(theme[`--color-v2-nudge-speckle-${i + 1}`]).toBe(color);
    });
    expect(root['--v2-nudge-speckle-alpha']).toBe(String(speckles.alpha));
    expect(root['--v2-nudge-orb-size']).toBe(`${orb.size}px`);
    expect(root['--v2-nudge-orb-turn']).toBe('135deg');
    expect(root['--v2-nudge-orb']).toBe(`conic-gradient(${[...orb.conic, orb.conic[0]].join(', ')})`);
    expect(root['--v2-done-mark-size']).toBe(`${v2.recipes.doneMark.size}px`);
    expect(root['--v2-done-mark-ring-width']).toBe(`${v2.recipes.doneMark.openWidth}px`);
    expect(root['--v2-done-mark-swirl']).toBe(`conic-gradient(${[...v2.recipes.doneMark.swirl, v2.recipes.doneMark.swirl[0]].join(', ')})`);
    expect(root['--v2-done-mark-turn']).toBe('135deg');
  });

  it('maps ink to --color-text and writes the page colour and both glows', () => {
    expect(theme['--color-text']).toBe(v2.roles.ink);
    expect(theme['--color-v2-page']).toBe(v2.roles.page.color);
    expect(theme['--color-v2-glow-sun']).toBe(v2.roles.page.glows.topRight);
    expect(theme['--color-v2-glow-sky']).toBe(v2.roles.page.glows.bottomLeft);
  });

  it('every name is a v2 name, --color-text or a --space-* layout var', () => {
    const all = [...Object.keys(theme), ...Object.keys(root)];
    expect(all.length).toBeGreaterThan(30);
    expect(new Set(all).size).toBe(all.length);
    for (const name of all) {
      if (name === '--color-text') {
        continue;
      }
      expect(name, name).toMatch(/^--(color-v2-|v2-|font-v2-(heading|body|eyebrow)$|space-\d+$)/);
    }
  });

  it('declares no name twice, within a block or across both', () => {
    const themeNames = rawNames(css, '@theme {');
    const rootNames = rawNames(css, ':root {');
    // A sanity floor: the v1 names (about 50) were counted here before #1010; v2 alone has 31.
    expect(themeNames.length).toBeGreaterThan(25);
    expect(repeated(themeNames)).toEqual([]);
    expect(repeated(rootNames)).toEqual([]);
    expect(repeated([...themeNames, ...rootNames])).toEqual([]);
  });

  it('the duplicate check reports a repeated line (negative control)', () => {
    const doubled = css.replace(
      '  --v2-radius: 8px;\n',
      '  --v2-radius: 8px;\n  --v2-radius: 9px;\n',
    );
    expect(repeated(rawNames(doubled, ':root {'))).toEqual(['--v2-radius']);
    const crossed = css.replace(
      '  --v2-radius: 8px;\n',
      '  --v2-radius: 8px;\n  --color-v2-link: red;\n',
    );
    expect(
      repeated([
        ...rawNames(crossed, '@theme {'),
        ...rawNames(crossed, ':root {'),
      ]),
    ).toEqual(['--color-v2-link']);
  });

  it('writes the type vars the page ticket reads', () => {
    expect(theme['--color-v2-heading']).toBe(v2.roles.heading.color);
    expect(theme['--color-v2-eyebrow']).toBe(v2.roles.eyebrow.color);
    expect(root['--v2-body-size']).toBe(`${v2.roles.body.size}px`);
    expect(root['--v2-eyebrow-size']).toBe(`${v2.roles.eyebrow.size}px`);
    expect(root['--v2-eyebrow-tracking']).toBe(
      `${v2.roles.eyebrow.tracking}em`,
    );
    expect(root['--v2-heading-weight']).toBe('300');
    expect(root['--v2-weight-light']).toBe('300');
    expect(root['--v2-weight-regular']).toBe('400');
    expect(root['--v2-weight-medium']).toBe('600');
    expect(root['--v2-heading-soft']).toBe('100');
  });

  it('is deterministic', () => {
    expect(toWebThemeCss({ ...input, v2 })).toBe(css);
  });

  it('a primitive change cascades into the emitted vars', () => {
    const p = structuredClone(v2.primitives) as unknown as Parameters<
      typeof buildRoles
    >[0];
    p.colors.link = '#010203';
    p.colors.ink = '#0d0e0f';
    p.colors.page = '#fafafa';
    p.colors.glowSun = '#fedcba';
    p.colors.glowSky = '#abcdef';
    p.colors.error = '#0a0b0c';
    p.colors.primaryBorder = '#112233';
    p.gradients.sunset.stops = ['#aaaaaa', '#bbbbbb', '#cccccc'];
    p.radius = 3;
    p.motion.settleMs = 3000;
    p.font.bodyFamily = 'Fixture';
    p.font.headingFamily = 'FixtureHead';
    p.shadows.sunset.color = 'rgba(1,2,3,0.5)';
    p.border.medium = 2.5;
    p.border.thin = 0.5;
    p.motion.spinMs = 7000;
    p.speckleAlpha = 0.5;
    p.size.orb = 30;
    p.colors.lavender = '#111111';
    p.colors.ocean = '#222222';
    p.font.weights.medium = 700;
    const roles = buildRoles(p);
    const changed = toWebThemeCss({
      ...input,
      v2: { primitives: p, roles, recipes: buildRecipes(roles, p) },
    });
    const t = declarations(changed, '@theme {');
    const r = declarations(changed, ':root {');
    expect(t['--color-v2-link']).toBe('#010203');
    expect(t['--color-text']).toBe('#0d0e0f');
    expect(t['--color-v2-page']).toBe('#fafafa');
    expect(t['--color-v2-glow-sun']).toBe('#fedcba');
    expect(t['--color-v2-glow-sky']).toBe('#abcdef');
    expect(t['--color-v2-error']).toBe('#0a0b0c');
    expect(t['--color-v2-focus']).toBe('#010203'); // the focus role follows the link primitive (#1005)
    expect(t['--color-v2-primary-border']).toBe('#112233');
    expect(t['--color-v2-secondary-border']).toBeUndefined();
    expect(t['--font-v2-eyebrow']).toMatch(/^'Fixture', /);
    expect(t['--font-v2-body']).toMatch(/^'Fixture', /);
    expect(t['--font-v2-heading']).toMatch(/^'FixtureHead', /);
    expect(r['--v2-primary-bg']).toBe(
      'linear-gradient(120deg, #aaaaaa, #bbbbbb, #cccccc)',
    );
    expect(r['--v2-radius']).toBe('3px');
    expect(r['--v2-settle-ms']).toBe('3000ms');
    expect(r['--v2-primary-shadow']).toContain('rgba(1,2,3,0.5)');
    expect(r['--v2-border-medium']).toBe('2.5px');
    expect(r['--v2-border-thin']).toBe('0.5px');
    expect(r['--v2-spin-ms']).toBe('7000ms');
    expect(r['--v2-weight-medium']).toBe('700');
    expect(t['--color-v2-nudge-speckle-1']).toBe('#111111');
    expect(t['--color-v2-nudge-speckle-4']).toBe('#222222');
    expect(r['--v2-nudge-speckle-alpha']).toBe('0.5');
    expect(r['--v2-nudge-orb-size']).toBe('30px');
    // settle 3000 of a 7000 turn
    expect(r['--v2-nudge-orb-turn']).toBe(`${(360 * 3000) / 7000}deg`);
    expect(r['--v2-nudge-orb']).toBe('conic-gradient(#222222, #279084, #111111, #f6c56b, #222222)');
    // The done mark: swirl stops are ocean, sea, lavender (ocean fixture-changed to #222222, lavender to #111111).
    expect(r['--v2-done-mark-size']).toBe('16px');
    expect(r['--v2-done-mark-ring-width']).toBe('2.5px');
    expect(r['--v2-done-mark-swirl']).toBe('conic-gradient(#222222, #279084, #111111, #222222)');
    expect(r['--v2-done-mark-turn']).toBe(`${(360 * 3000) / 7000}deg`);
  });
});

describe('webHeadingFontStack', () => {
  it('starts with the heading family and ends in a generic serif', () => {
    expect(webHeadingFontStack(v2.primitives)).toBe("'Fraunces', ui-serif, Georgia, 'Times New Roman', serif");
  });
});

describe('webFontStack', () => {
  it('starts with the body family and ends in a generic family', () => {
    expect(webFontStack(v2.primitives)).toBe(
      "'Nunito Sans', system-ui, -apple-system, 'Segoe UI', sans-serif",
    );
    expect(
      webFontStack({ font: { ...v2.primitives.font, bodyFamily: 'Other' } }),
    ).toMatch(/^'Other', .*sans-serif$/);
  });
});
