import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { v2 } from '@griever/tokens';

const html = readFileSync(resolve(__dirname, '../index.html'), 'utf8');
const css = readFileSync(resolve(__dirname, 'styles.css'), 'utf8');

const theme = readFileSync(resolve(__dirname, 'theme.generated.css'), 'utf8');

/** The declarations of every rule whose selector matches exactly, joined. */
function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const blocks = [...css.matchAll(new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\{([^}]*)\\}`, 'g'))];
  if (blocks.length === 0) {
    throw new Error(`No rule for ${selector}`);
  }
  return blocks.map((block) => block[1]).join('\n');
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(path);
    }
    return /\.(tsx?|css)$/.test(entry.name) && entry.name !== 'theme.generated.css' && !entry.name.endsWith('.spec.ts') && !entry.name.endsWith('.spec.tsx')
      ? [path]
      : [];
  });
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

describe('index.html fonts', () => {
  const sora = /family=Sora:wght@([0-9;]+)&display=swap/.exec(html);

  it('loads Sora at 300, 400 and 500 only, with display=swap', () => {
    expect(sora?.[1]).toBe('300;400;500');
  });

  it('has no Source Serif link', () => {
    expect(html).not.toMatch(/Source\+Serif|Source Serif/i);
  });
});

describe('styles.css type roles', () => {
  it('sets the body to Sora regular at the body size, with no font synthesis', () => {
    const body = rule('body');
    expect(body).toContain('font-family: var(--font-v2)');
    expect(body).toContain('font-size: var(--v2-body-size)');
    expect(body).toContain('font-weight: var(--v2-weight-regular)');
    expect(body).toContain('font-synthesis-style: none');
  });

  it('makes h1 light and h2 to h6 regular in the heading colour', () => {
    expect(rule('h1, h2, h3, h4, h5, h6')).toContain('font-weight: var(--v2-weight-regular)');
    expect(rule('h1, h2, h3, h4, h5, h6')).toContain('color: var(--color-v2-heading)');
    expect(rule('h1')).toContain('font-weight: var(--v2-heading-weight)');
  });

  it.each(['.gg-eyebrow', '.gg-card-kicker'])('%s uses the eyebrow size, tracking and colour, uppercase', (selector) => {
    const decl = rule(selector);
    expect(decl).toContain('font-size: var(--v2-eyebrow-size)');
    expect(decl).toContain('letter-spacing: var(--v2-eyebrow-tracking)');
    expect(decl).toContain('text-transform: uppercase');
    expect(decl).toContain('color: var(--color-v2-eyebrow)');
  });

  it('uses no weight above 500 and no serif var', () => {
    expect(css).not.toMatch(/font-weight:\s*(6|7|8|9)00/);
    expect(css).not.toContain('var(--font-serif)');
  });

  it('defines every var the type rules use (theme.generated.css or the :root block)', () => {
    const rules = ['body', 'h1, h2, h3, h4, h5, h6', 'h1', '.gg-eyebrow', '.gg-card-kicker'].map(rule).join('\n');
    const used = [...rules.matchAll(/var\((--[\w-]+)\)/g)].map((m) => m[1]);
    expect(used.length).toBeGreaterThan(0);
    for (const name of new Set(used)) {
      expect(`${theme}\n${css}`, name).toMatch(new RegExp(`${name}:`));
    }
  });

  it('has no font-serif class anywhere in apps/web/src', () => {
    const offenders = sourceFiles(__dirname).filter((file) => /font-serif/.test(readFileSync(file, 'utf8')) && !file.endsWith('v2Styles.spec.ts'));
    expect(offenders).toEqual([]);
  });

  it('keeps the eyebrow colour at 4.5:1 or more on --color-surface', () => {
    const surface = /--color-surface:\s*(#[0-9a-f]{6})/i.exec(theme)?.[1];
    expect(surface).toBeDefined();
    expect(contrast(v2.roles.eyebrow.color, surface as string)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('styles.css page ground and glows', () => {
  const glow = rule('body::before');

  it('paints the body with the generated page colour and ink', () => {
    const body = rule('body');
    expect(body).toContain('background: var(--color-v2-page)');
    expect(body).toContain('color: var(--color-text)');
    expect(theme).toContain(`--color-v2-page: ${v2.roles.page.color};`);
    expect(theme).toContain(`--color-text: ${v2.roles.ink};`);
  });

  it('drops the hand-written --color-text alias', () => {
    expect(css).not.toMatch(/--color-text\s*:/);
  });

  it('puts both glows on one fixed layer behind content that takes no pointer events', () => {
    expect(glow).toMatch(/position:\s*fixed/);
    expect(glow).toMatch(/inset:\s*0/);
    expect(glow).toMatch(/pointer-events:\s*none/);
    expect(glow).toMatch(/z-index:\s*-1/);
    expect(glow).toContain('var(--color-v2-glow-sun)');
    expect(glow).toContain('var(--color-v2-glow-sky)');
    expect(glow).toMatch(/radial-gradient\(80% 60% at 100% 0%/);
    expect(glow).toMatch(/radial-gradient\(80% 60% at 0% 100%/);
  });

  it('does not animate the glow, use background-attachment, or make body a stacking context', () => {
    expect(glow).not.toMatch(/animation|transition|transform/);
    expect(`${rule('body')}\n${glow}`).not.toMatch(/background-attachment/);
    expect(rule('body')).not.toMatch(/z-index|transform|filter|isolation|will-change|position/);
  });

  it('keeps html free of a background, so the body colour sits on the canvas under the glow layer', () => {
    const rootRules = [...css.matchAll(/(?:^|\n)\s*(?:html|:root)\s*\{[^}]*\}/g)].map((m) => m[0]).join('\n');
    expect(rootRules).not.toMatch(/background/);
  });

  it('gives plain inputs the v2 field edge, 3:1 or more on the page and both glows', () => {
    const hex = (name: string) => {
      const found = theme.match(new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, 'i'));
      if (!found) {
        throw new Error(`${name} is not a hex var in theme.generated.css`);
      }
      return found[1];
    };
    expect(rule('.gg-input')).toContain('border: 1px solid var(--color-v2-field-edge)');
    for (const ground of ['--color-v2-page', '--color-v2-glow-sun', '--color-v2-glow-sky']) {
      expect(contrast(hex('--color-v2-field-edge'), hex(ground)), ground).toBeGreaterThanOrEqual(3);
    }
  });

  it('lets the glow show: no full-page wrapper paints an opaque background over it', () => {
    const offenders = sourceFiles(__dirname).filter((file) => {
      const text = readFileSync(file, 'utf8');
      // Inline styles or Tailwind bg classes, in any attribute order, on any full-height wrapper.
      const wrapper = /<\w+[^>]*\b(?:min-h-screen|h-screen|min-h-dvh)\b[^>]*>/g;
      return [...text.matchAll(wrapper)].some((m) => /background|!?\bbg-/.test(m[0])) && !file.endsWith('v2Styles.spec.ts');
    });
    expect(offenders).toEqual([]);
  });

  it('uses no literal colours in the page and glow rules, and defines every var they use', () => {
    const rules = `${rule('body')}\n${glow}`;
    expect(rules).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
    const used = [...rules.matchAll(/var\((--[\w-]+)\)/g)].map((m) => m[1]);
    expect(used.length).toBeGreaterThan(0);
    for (const name of new Set(used)) {
      expect(`${theme}\n${css}`, name).toMatch(new RegExp(`${name}:`));
    }
  });
});

type Rgba = { rgb: [number, number, number]; alpha: number };

function parseRgba(value: string): Rgba {
  const found = /rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/.exec(value);
  if (!found) {
    throw new Error(`Not an rgba() value: ${value}`);
  }
  return { rgb: [Number(found[1]), Number(found[2]), Number(found[3])], alpha: Number(found[4]) };
}

function toRgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

function toHex(rgb: number[]): string {
  return `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
}

/** Blend a translucent colour over an opaque hex ground; returns the opaque hex result. */
function blend(top: Rgba, ground: string): string {
  const base = toRgb(ground);
  return toHex(top.rgb.map((c, i) => c * top.alpha + base[i] * (1 - top.alpha)));
}

function themeVar(name: string): string {
  const found = theme.match(new RegExp(`${name}:\\s*([^;]+);`));
  if (!found) {
    throw new Error(`${name} is not in theme.generated.css`);
  }
  return found[1].trim();
}

const grounds = ['--color-v2-page', '--color-v2-glow-sun', '--color-v2-glow-sky'];
const glass = () => parseRgba(themeVar('--color-v2-card-fill'));
const glassOver = (ground: string) => blend(glass(), themeVar(ground));

describe('styles.css glass cards and panels', () => {
  it.each(['.gg-card', '.gg-panel'])('%s uses the glass fill, edge, shadow and radius vars', (selector) => {
    const decl = rule(selector);
    expect(decl).toContain('background: var(--color-v2-card-fill)');
    expect(decl).toContain('border: var(--v2-border-thin) solid var(--color-v2-card-border)');
    expect(decl).toContain('box-shadow: var(--v2-card-shadow)');
    expect(decl).toContain('border-radius: var(--v2-radius)');
  });

  it('has an 8px radius and a 1px edge in the generated vars', () => {
    expect(themeVar('--v2-radius')).toBe('8px');
    expect(themeVar('--v2-border-thin')).toBe('1px');
  });

  it('keeps the 2px selected ring', () => {
    expect(rule('.gg-card-selected')).toContain('outline: 2px solid var(--color-accent)');
  });

  it('gives panel inputs the v2 field fill and edge (focus comes from the unlayered .gg-input ring)', () => {
    expect(rule('.gg-panel .gg-input')).toContain('background: var(--color-v2-field-fill)');
    expect(rule('.gg-panel .gg-input')).toContain('border-color: var(--color-v2-field-edge)');
  });

  it('shows keyboard focus on a selected card with a second ring outside the selection ring', () => {
    const focused = rule('.gg-card-selected:focus-visible');
    expect(focused).toContain('var(--color-accent-700)');
    expect(focused).toContain('box-shadow');
    for (const ground of grounds) {
      expect(contrast(themeVar('--color-accent-700'), themeVar(ground)), ground).toBeGreaterThanOrEqual(3);
    }
  });

  it('strips the glass edge and shadow from a card nested in the checklist panel', () => {
    const panel = readFileSync(join(__dirname, 'cms/checklist/ChecklistPanel.tsx'), 'utf8');
    for (const cls of ['[&_.gg-card]:bg-transparent', '[&_.gg-card]:border-0', '[&_.gg-card]:shadow-none']) {
      expect(panel).toContain(cls);
    }
  });

  it.each(grounds)('keeps the field edge at 3:1 or more against glass over %s', (ground) => {
    expect(contrast(themeVar('--color-v2-field-edge'), glassOver(ground))).toBeGreaterThanOrEqual(3);
  });

  it.each(grounds)('keeps --text-muted and --text-hint at 4.5:1 or more on glass over %s', (ground) => {
    const text = toRgb(themeVar('--color-text'));
    const surface = glassOver(ground);
    for (const name of ['--text-muted', '--text-hint']) {
      const percent = /--text-(?:muted|hint):\s*color-mix\(in srgb, var\(--color-text\) (\d+)%/.exec(
        css.match(new RegExp(`${name}:[^;]+;`))?.[0] ?? '',
      );
      expect(percent, name).not.toBeNull();
      const tone = blend({ rgb: text, alpha: Number(percent?.[1]) / 100 }, surface);
      expect(contrast(tone, surface), `${name} on ${ground}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('uses no literal colours in the card and panel rules, and defines every var they use', () => {
    const rules = ['.gg-card', '.gg-panel', '.gg-panel .gg-input'].map(rule).join('\n');
    expect(rules).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
    const used = [...rules.matchAll(/var\((--[\w-]+)\)/g)].map((m) => m[1]);
    expect(used.length).toBeGreaterThan(0);
    for (const name of new Set(used)) {
      expect(`${theme}\n${css}`, name).toMatch(new RegExp(`${name}:`));
    }
  });
});

describe('styles.css swirl buttons', () => {
  /** The body of the first block that starts with the given at-rule or selector, found by matching braces. */
  function block(header: string): string {
    const at = css.indexOf(header);
    if (at < 0) {
      throw new Error(`No block for ${header}`);
    }
    const open = css.indexOf('{', at);
    let depth = 0;
    for (let i = open; i < css.length; i += 1) {
      if (css[i] === '{') {
        depth += 1;
      } else if (css[i] === '}') {
        depth -= 1;
        if (depth === 0) {
          return css.slice(open + 1, i);
        }
      }
    }
    throw new Error(`Unclosed block for ${header}`);
  }

  const hexVar = (name: string) => {
    const found = theme.match(new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, 'i'));
    if (!found) {
      throw new Error(`${name} is not a hex var in theme.generated.css`);
    }
    return found[1];
  };
  const stopsOf = (name: string) => [...themeVar(name).matchAll(/#[0-9a-f]{6}/gi)].map((m) => m[0]);
  const page = hexVar('--color-v2-page');
  const swirls = [
    { name: 'primary', bg: '--v2-primary-bg', text: '--color-v2-primary-text' },
    { name: 'secondary', bg: '--v2-secondary-bg', text: '--color-v2-secondary-text' },
  ];
  const buttonRules = [
    '.gg-btn-primary',
    '.gg-btn-secondary',
    ".gg-btn-primary:not(:disabled):not([aria-disabled='true']):hover,\n  .gg-btn-secondary:not(:disabled):not([aria-disabled='true']):hover",
    ".gg-btn-primary:not(:disabled):not([aria-disabled='true']):active,\n  .gg-btn-secondary:not(:disabled):not([aria-disabled='true']):active",
    ".gg-btn-primary:disabled,\n  .gg-btn-primary[aria-disabled='true']",
    ".gg-btn-secondary:disabled,\n  .gg-btn-secondary[aria-disabled='true']",
  ];
  const media = block('@media (prefers-reduced-motion: no-preference)');

  it('declares the animation and the keyframes only inside the no-preference block', () => {
    const outside = css.replace(media, '');
    expect(media).toMatch(/animation:/);
    expect(media).toMatch(/@keyframes gg-swirl-drift/);
    expect(outside).not.toMatch(/gg-swirl-drift/);
    // Other animations in the file may exist; none may touch the swirl buttons outside the block.
    expect(rule('.gg-btn-primary')).not.toMatch(/animation/);
    expect(rule('.gg-btn-secondary')).not.toMatch(/animation/);
  });

  it('drifts one pass of the settle var, then rests (forwards), on enabled buttons only', () => {
    const decl = /animation:\s*([^;]+);/.exec(media)?.[1] ?? '';
    expect(decl).toContain('var(--v2-settle-ms)');
    expect(decl).toMatch(/\bforwards\b/);
    expect(decl).not.toMatch(/infinite|alternate/);
    expect(decl).not.toMatch(/\b\d+\s*(?:ms|s)\b/);
    expect(media).toContain(":not(:disabled):not([aria-disabled='true'])");
    // Every settle value is under 5 s (WCAG 2.2.2).
    expect(parseInt(themeVar('--v2-settle-ms'), 10)).toBeLessThanOrEqual(5000);
  });

  it('animates background-position over a fill larger than the button', () => {
    expect(rule('.gg-btn-primary,\n  .gg-btn-secondary')).toMatch(/background-size:\s*2\d\d%/);
    expect(block('@keyframes gg-swirl-drift')).toMatch(/background-position/);
  });

  it('gives primary and secondary their swirl, text, weight, edge, shadow and radius from the generated vars', () => {
    const primary = rule('.gg-btn-primary');
    expect(primary).toContain('background-image: var(--v2-primary-bg)');
    expect(primary).toContain('color: var(--color-v2-primary-text)');
    expect(primary).toContain('font-weight: var(--v2-weight-medium)');
    expect(primary).toContain('border-width: var(--v2-border-thin)');
    expect(primary).toContain('border-color: var(--color-v2-primary-border)');
    expect(primary).toContain('box-shadow: var(--v2-primary-shadow)');
    const secondary = rule('.gg-btn-secondary');
    expect(secondary).toContain('background-image: var(--v2-secondary-bg)');
    expect(secondary).toContain('color: var(--color-v2-secondary-text)');
    expect(secondary).toContain('font-weight: var(--v2-weight-regular)');
    expect(secondary).toContain('border-width: var(--v2-border-medium)');
    expect(secondary).toContain('border-color: var(--color-v2-secondary-border)');
    expect(secondary).toContain('box-shadow: var(--v2-secondary-shadow)');
    expect(rule('.gg-btn-primary,\n  .gg-btn-secondary')).toContain('border-radius: var(--v2-radius)');
    expect(themeVar('--v2-radius')).toBe('8px');
  });

  it.each(swirls)('keeps the $name label at 4.5:1 or more on every stop at rest, hover and pressed', ({ bg, text }) => {
    const stops = stopsOf(bg);
    expect(stops.length).toBeGreaterThanOrEqual(3);
    for (const alpha of [1, 0.92, 0.85]) {
      // The whole button dims over the page, so both the label and the stop blend with it.
      const label = blend({ rgb: toRgb(hexVar(text)), alpha }, page);
      for (const stop of stops) {
        expect(contrast(label, blend({ rgb: toRgb(stop), alpha }, page)), `${bg} ${stop} at ${alpha}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('uses the same opacities in the hover and pressed rules as the spec checks', () => {
    expect(rule(buttonRules[2])).toMatch(/opacity:\s*0\.92/);
    expect(rule(buttonRules[3])).toMatch(/opacity:\s*0\.85/);
  });

  it('makes a disabled or aria-disabled primary a flat ink fill with page text, 4.5:1 or more, and no swirl', () => {
    const decl = rule(buttonRules[4]);
    expect(decl).toContain('background-image: none');
    expect(decl).toContain('background-color: var(--color-text)');
    expect(decl).toContain('color: var(--color-v2-page)');
    expect(contrast(hexVar('--color-text'), page)).toBeGreaterThanOrEqual(4.5);
  });

  it('makes a disabled or aria-disabled secondary a flat page fill with a dashed edge and its own text colour', () => {
    const decl = rule(buttonRules[5]);
    expect(decl).toContain('background-image: none');
    expect(decl).toContain('background-color: var(--color-v2-page)');
    expect(decl).toContain('border-style: dashed');
    expect(decl).not.toMatch(/(?:^|[\s;])color:/);
    expect(decl).not.toMatch(/animation/);
    expect(contrast(hexVar('--color-v2-secondary-text'), page)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps unavailable buttons focusable: no pointer-events rule and no outline removal on them', () => {
    const rules = buttonRules.map(rule).join('\n');
    expect(rules).not.toMatch(/pointer-events|outline/);
  });

  it('uses no literal colours in the swirl button rules, and defines every var they use', () => {
    const rules = `${buttonRules.map(rule).join('\n')}\n${media}`;
    expect(rules).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
    const used = [...rules.matchAll(/var\((--[\w-]+)\)/g)].map((m) => m[1]);
    expect(used.length).toBeGreaterThan(0);
    for (const name of new Set(used)) {
      expect(theme, name).toMatch(new RegExp(`${name}:`));
    }
  });
});
