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
  /** The body of the first block that starts with the given header, found by matching braces. */
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

  /** Declarations of every rule whose comma-separated selector list contains this selector (comments ignored). */
  function decls(selector: string, source = css): string {
    const bare = source.replace(/\/\*[\s\S]*?\*\//g, '');
    const found = [...bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => m[1].split(',').some((part) => part.trim() === selector));
    if (found.length === 0) {
      throw new Error(`No rule for ${selector}`);
    }
    return found.map((m) => m[2]).join('\n');
  }

  const hexVar = (name: string) => {
    const found = theme.match(new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, 'i'));
    if (!found) {
      throw new Error(`${name} is not a hex var in theme.generated.css`);
    }
    return found[1];
  };
  const stopsOf = (name: string) => [...themeVar(name).matchAll(/#[0-9a-f]{6}/gi)].map((m) => m[0]);
  const mix = (a: string, b: string, t: number) => blend({ rgb: toRgb(a), alpha: t }, b);
  /** Every stop plus the midpoint of each neighbouring pair: the colours a drifting gradient passes through. */
  const sampled = (name: string) => {
    const stops = stopsOf(name);
    return [...stops, ...stops.slice(1).map((stop, i) => mix(stop, stops[i], 0.5))];
  };
  const page = hexVar('--color-v2-page');
  const grounds = ['--color-v2-page', '--color-v2-glow-sun', '--color-v2-glow-sky'].map(hexVar);
  // Glass cards sit over each ground: white at 65% (primitives.glassFill).
  const glassOver = grounds.map((g) => blend({ rgb: [255, 255, 255], alpha: 0.65 }, g));
  const swirls = [
    { name: 'primary', bg: '--v2-primary-bg', text: '--color-v2-primary-text', edge: '--color-v2-primary-border', base: '.gg-btn-primary' },
    { name: 'secondary', bg: '--v2-secondary-bg', text: '--color-v2-secondary-text', edge: '--color-v2-secondary-border', base: '.gg-btn-secondary' },
  ];
  const noPref = block('@media (prefers-reduced-motion: no-preference)');
  const enabled = ":not(:disabled):not([aria-disabled='true'])";

  it('gives every swirl selector its data-gg-btn twin in the same list, so the libs/ui Button (data attribute, no class) gets the same look', () => {
    const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const lists = [...bare.matchAll(/([^{}]+)\{/g)].map((m) => m[1].split(',').map((part) => part.trim()));
    let checked = 0;
    for (const list of lists) {
      for (const variant of ['primary', 'secondary']) {
        const classParts = list.filter((part) => part.startsWith(`.gg-btn-${variant}`) && !part.includes('.gg-enter'));
        for (const part of classParts) {
          const twin = part.replace(`.gg-btn-${variant}`, `[data-gg-btn='${variant}']`);
          expect(list, `${part} needs ${twin} in the same list`).toContain(twin);
          checked += 1;
        }
      }
    }
    expect(checked).toBeGreaterThan(10);
    expect(css).toMatch(/\[data-gg-btn\]\s*\{/);
  });

  it('repeats the edge and state fills unlayered on button[data-gg-btn] with the same vars as the layered rules, so react-native-web resets cannot win', () => {
    const unlayered = css.replace(block('@layer components'), '');
    const primary = decls("button[data-gg-btn='primary']", unlayered);
    expect(primary).toMatch(/border:[^;]*var\(--v2-border-thin\)[^;]*solid[^;]*var\(--color-v2-primary-border\)/);
    expect(decls('.gg-btn-primary')).toContain('border-width: var(--v2-border-thin)');
    expect(decls('.gg-btn-primary')).toContain('border-color: var(--color-v2-primary-border)');

    const secondary = decls("button[data-gg-btn='secondary']", unlayered);
    expect(secondary).toMatch(/border:[^;]*var\(--v2-border-medium\)[^;]*solid[^;]*var\(--color-v2-secondary-border\)/);
    expect(decls('.gg-btn-secondary')).toContain('border-width: var(--v2-border-medium)');
    expect(decls('.gg-btn-secondary')).toContain('border-color: var(--color-v2-secondary-border)');

    const pressed = decls("button[data-gg-btn='secondary'][aria-pressed='true']", unlayered);
    expect(pressed).toContain('background-color: var(--color-accent-100)');
    expect(decls(".gg-btn-secondary[aria-pressed='true']")).toContain('background-color: var(--color-accent-100)');

    for (const variant of ['primary', 'secondary']) {
      const disabled = decls(`button[data-gg-btn='${variant}'][aria-disabled='true']`, unlayered);
      expect(disabled).toContain('border-style: dashed');
      expect(disabled).toContain('background-color: var(--color-v2-page)');
      const layered = decls(`.gg-btn-${variant}[aria-disabled='true']`);
      expect(layered).toContain('border-style: dashed');
      expect(layered).toContain('background-color: var(--color-v2-page)');
    }
  });

  it('declares every animation that touches a button, and the swirl keyframes, only inside a no-preference block', () => {
    const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const noPrefBlocks = [...bare.matchAll(/@media \(prefers-reduced-motion: no-preference\)/g)].map((m) => block(m[0]));
    const outside = noPrefBlocks.reduce((rest, inner) => rest.replace(inner, ''), bare);
    for (const [, selector] of [...outside.matchAll(/([^{}]+)\{[^{}]*\banimation(?:-name)?:\s*(?!\s*none)[^;}]*/g)]) {
      expect(selector, 'animation outside no-preference').not.toMatch(/gg-btn/);
    }
    expect(outside).not.toMatch(/@keyframes gg-swirl-drift/);
    expect(noPref).toMatch(/@keyframes gg-swirl-drift/);
    expect(block('@keyframes gg-swirl-drift')).toMatch(/background-position/);
  });

  it('drifts one pass of the settle var, then rests (forwards), from the base classes so a re-enable does not replay it', () => {
    const decl = /animation:\s*([^;]+);/.exec(decls('.gg-btn-primary', noPref))?.[1] ?? '';
    expect(decl).toContain('var(--v2-settle-ms)');
    expect(decl).toMatch(/\bforwards\b/);
    expect(decl).not.toMatch(/infinite|alternate/);
    expect(decls('.gg-btn-secondary', noPref)).toContain(decl);
    expect(parseInt(themeVar('--v2-settle-ms'), 10)).toBeLessThanOrEqual(5000);
    expect(decls('.gg-btn-primary:disabled')).toContain('animation: none');
    expect(decls(".gg-btn-secondary[aria-disabled='true']")).toContain('animation: none');
  });

  it('runs the enter fade and the drift together on a swirl button that also has gg-enter', () => {
    for (const base of ['.gg-btn-primary', '.gg-btn-secondary']) {
      const decl = decls(`${base}.gg-enter`, noPref);
      expect(decl).toMatch(/animation:\s*gg-enter [^,;]+,\s*gg-swirl-drift var\(--v2-settle-ms\) ease-in-out forwards/);
    }
  });

  it('animates background-position over a fill larger than the button', () => {
    expect(decls('.gg-btn-primary')).toMatch(/background-size:\s*2\d\d%/);
  });

  it('gives primary and secondary their swirl, text, weight, edge, shadow and radius from the generated vars', () => {
    const primary = decls('.gg-btn-primary');
    expect(primary).toContain('background-image: var(--v2-primary-bg)');
    expect(primary).toContain('color: var(--color-v2-primary-text)');
    expect(primary).toContain('font-weight: var(--v2-weight-medium)');
    expect(primary).toContain('border-width: var(--v2-border-thin)');
    expect(primary).toContain('border-color: var(--color-v2-primary-border)');
    expect(primary).toContain('box-shadow: var(--v2-primary-shadow)');
    const secondary = decls('.gg-btn-secondary');
    expect(secondary).toContain('background-image: var(--v2-secondary-bg)');
    expect(secondary).toContain('color: var(--color-v2-secondary-text)');
    expect(secondary).toContain('font-weight: var(--v2-weight-regular)');
    expect(secondary).toContain('border-width: var(--v2-border-medium)');
    expect(secondary).toContain('border-color: var(--color-v2-secondary-border)');
    expect(secondary).toContain('box-shadow: var(--v2-secondary-shadow)');
    expect(decls('.gg-btn-primary')).toContain('border-radius: var(--v2-radius)');
    expect(themeVar('--v2-radius')).toBe('8px');
  });

  it('washes only the fill on hover and pressed (8% and 15% page colour), keeps opacity 1, and hovers only where a pointer can', () => {
    const hover = block('@media (hover: hover)');
    for (const { base } of swirls) {
      const hoverSelector = base === '.gg-btn-secondary' ? `${base}${enabled}:not([aria-pressed='true']):hover` : `${base}${enabled}:hover`;
      expect(decls(hoverSelector, hover)).toMatch(/color-mix\(in srgb, var\(--color-v2-page\) 8%, transparent\)/);
      const pressed = base === '.gg-btn-secondary' ? `${base}${enabled}:not([aria-pressed='true']):active` : `${base}${enabled}:active`;
      expect(decls(pressed)).toMatch(/color-mix\(in srgb, var\(--color-v2-page\) 15%, transparent\)/);
    }
    expect(css.replace(hover, '')).not.toMatch(/\.gg-btn-(?:primary|secondary)[^{}]*:hover/);
    expect(css).not.toMatch(/\.gg-btn-(?:primary|secondary)[^{}]*\{[^}]*opacity:\s*0\.\d+/);
  });

  it.each(swirls)('keeps the $name label at 4.5:1 or more on every stop and midpoint at rest, hover (8%) and pressed (15%)', ({ bg, text }) => {
    for (const wash of [0, 0.08, 0.15]) {
      for (const colour of sampled(bg)) {
        expect(contrast(hexVar(text), mix(page, colour, wash)), `${bg} ${colour} wash ${wash}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it.each(swirls)('keeps the $name edge at 3:1 or more on the page, both glows and glass over each, in every state', ({ edge }) => {
    // The edge colour and its opacity do not change between states (only the fill is washed), so one check covers rest, hover and pressed.
    for (const ground of [...grounds, ...glassOver]) {
      expect(contrast(hexVar(edge), ground), `${edge} on ${ground}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('makes a disabled or aria-disabled primary quiet: flat page fill, dashed edge, no swirl, shadow or animation, its own label colour', () => {
    const decl = decls(".gg-btn-primary[aria-disabled='true']");
    expect(decl).toContain('background-image: none');
    expect(decl).toContain('background-color: var(--color-v2-page)');
    expect(decl).toContain('border-style: dashed');
    expect(decl).toContain('box-shadow: none');
    expect(decl).toContain('animation: none');
    expect(decl).not.toMatch(/(?:^|[\s;])color:|border-color/);
    expect(decls('.gg-btn-primary:disabled')).toBe(decl);
    expect(contrast(hexVar('--color-v2-primary-text'), page)).toBeGreaterThanOrEqual(4.5);
    // The dashed edge keeps the primary edge colour; it holds 3:1 on the page, both glows and glass over each.
    for (const ground of [...grounds, ...glassOver]) {
      expect(contrast(hexVar('--color-v2-primary-border'), ground), ground).toBeGreaterThanOrEqual(3);
    }
  });

  it('makes a disabled or aria-disabled secondary a flat page fill with a dashed edge and its own text colour', () => {
    const decl = decls(".gg-btn-secondary[aria-disabled='true']");
    expect(decl).toContain('background-image: none');
    expect(decl).toContain('background-color: var(--color-v2-page)');
    expect(decl).toContain('border-style: dashed');
    expect(decl).not.toMatch(/(?:^|[\s;])color:/);
    expect(contrast(hexVar('--color-v2-secondary-text'), page)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps a pressed toggle secondary as a flat accent-100 tint with no swirl or animation, label 4.5:1 or more', () => {
    const decl = decls(".gg-btn-secondary[aria-pressed='true']");
    expect(decl).toContain('background-image: none');
    expect(decl).toContain('background-color: var(--color-accent-100)');
    expect(decl).toContain('animation: none');
    expect(contrast(hexVar('--color-v2-secondary-text'), hexVar('--color-accent-100'))).toBeGreaterThanOrEqual(4.5);
  });

  it('draws the swirl focus ring in accent-700 (4.5:1 or more on the page, glows and glass), unlayered, with no outline removal', () => {
    const selector = '.gg-btn-primary:focus-visible';
    const at = css.indexOf(selector);
    const layerEnd = css.lastIndexOf('\n}\n', at);
    // Unlayered: the @layer block that holds the components has closed before this rule.
    expect(block('@layer components')).not.toContain(selector);
    expect(layerEnd).toBeGreaterThan(0);
    expect(decls(selector)).toContain('outline-color: var(--color-accent-700)');
    expect(decls('.gg-btn-secondary:focus-visible')).toContain('outline-color: var(--color-accent-700)');
    for (const ground of [...grounds, ...glassOver]) {
      expect(contrast(hexVar('--color-accent-700'), ground)).toBeGreaterThanOrEqual(4.5);
    }
    const rules = ['.gg-btn-primary', '.gg-btn-secondary', ".gg-btn-primary[aria-disabled='true']", ".gg-btn-secondary[aria-disabled='true']"].map((s) => decls(s)).join('\n');
    expect(rules).not.toMatch(/pointer-events|outline/);
  });

  it('uses no literal colours in the swirl button rules, and defines every var they use', () => {
    const rules = [
      '.gg-btn-primary',
      '.gg-btn-secondary',
      ".gg-btn-primary[aria-disabled='true']",
      ".gg-btn-secondary[aria-disabled='true']",
      ".gg-btn-secondary[aria-pressed='true']",
      `.gg-btn-primary${enabled}:active`,
      '.gg-btn-primary:focus-visible',
    ]
      .map((s) => decls(s))
      .join('\n');
    expect(`${rules}\n${block('@media (hover: hover)')}\n${noPref}`).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
    const used = [...rules.matchAll(/var\((--[\w-]+)\)/g)].map((m) => m[1]);
    expect(used.length).toBeGreaterThan(0);
    for (const name of new Set(used)) {
      expect(theme, name).toMatch(new RegExp(`${name}:`));
    }
  });

  it('has no swirl button in a TSX file that adds its own animate- or bg- utility, apart from the aria-pressed tint handled in CSS', () => {
    const offenders = sourceFiles(__dirname).flatMap((file) => {
      if (!file.endsWith('.tsx')) {
        return [];
      }
      return readFileSync(file, 'utf8')
        .split('\n')
        .filter((line) => /gg-btn-(?:primary|secondary)/.test(line) && /(?:^|[\s'"`:])(?:animate-|bg-)/.test(line.replace(/aria-pressed:bg-accent-100/g, '')))
        .map((line) => `${file}: ${line.trim()}`);
    });
    expect(offenders).toEqual([]);
  });
});

describe('styles.css phone nudge (#1003)', () => {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const noPrefStart = bare.indexOf('@media (prefers-reduced-motion: no-preference) {\n    .gg-phone-nudge {');
  const noPrefOpen = bare.indexOf('{', noPrefStart);
  let depth = 0;
  let noPrefEnd = noPrefOpen;
  for (let i = noPrefOpen; i < bare.length; i += 1) {
    if (bare[i] === '{') {
      depth += 1;
    } else if (bare[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        noPrefEnd = i;
        break;
      }
    }
  }
  const noPref = bare.slice(noPrefOpen + 1, noPrefEnd);
  /** Everything except the no-preference block. */
  const outside = bare.slice(0, noPrefStart) + bare.slice(noPrefEnd + 1);
  /** Declarations of the one rule with this exact selector, in the given source. */
  const decls = (selector: string, source: string) => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\>]/g, '\\$&');
    const found = [...source.matchAll(new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\{([^{}]*)\\}`, 'g'))];
    if (found.length === 0) {
      throw new Error(`No rule for ${selector}`);
    }
    return found.map((m) => m[1]).join('\n');
  };
  const nudgeRules = [
    '.gg-phone-nudge',
    '.gg-phone-nudge-orb',
    '.gg-phone-nudge-speckles',
    '.gg-phone-nudge-speckles > span',
    ...[1, 2, 3, 4, 5, 6, 7].map((n) => `.gg-phone-nudge-speckles > span:nth-child(${n})`),
  ];

  it('takes the swirl, text, edge, shadow and radius from the generated nudge vars', () => {
    const card = decls('.gg-phone-nudge', outside);
    expect(card).toContain('background-image: var(--v2-nudge-bg)');
    expect(card).toMatch(/background-size:\s*200% 200%/);
    expect(card).toContain('color: var(--color-v2-nudge-text)');
    expect(card).toMatch(/border:\s*var\(--v2-border-thin\) solid var\(--color-v2-nudge-border\)/);
    expect(card).toContain('box-shadow: var(--v2-nudge-shadow)');
    expect(card).toContain('border-radius: var(--v2-radius)');
    expect(card).not.toMatch(/--shadow-md|--color-accent-100/);
  });

  it('draws the orb as a conic gradient that takes no pointer events, and the speckles inside the card, faint and small', () => {
    expect(decls('.gg-phone-nudge-orb', outside)).toMatch(/background-image:\s*conic-gradient\(/);
    expect(decls('.gg-phone-nudge-orb', outside)).toContain('pointer-events: none');
    expect(decls('.gg-phone-nudge-speckles', outside)).toContain('pointer-events: none');
    expect(decls('.gg-phone-nudge-speckles > span', outside)).toMatch(/opacity:\s*0\.28/);
  });

  it('declares every nudge animation only inside a no-preference block, as one pass of the settle var that rests (forwards)', () => {
    expect(outside).not.toMatch(/\.gg-phone-nudge[^{}]*\{[^{}]*\banimation/);
    expect(outside).not.toMatch(/@keyframes gg-orb-turn/);
    const card = /animation:\s*([^;]+);/.exec(decls('.gg-phone-nudge', noPref))?.[1] ?? '';
    expect(card).toContain('gg-swirl-drift var(--v2-settle-ms)');
    const orb = /animation:\s*([^;]+);/.exec(decls('.gg-phone-nudge-orb', noPref))?.[1] ?? '';
    expect(orb).toContain('var(--v2-settle-ms)');
    for (const decl of [card, orb, /animation:\s*([^;]+);/.exec(decls('.gg-phone-nudge.gg-enter', noPref))?.[1] ?? '']) {
      expect(decl).toMatch(/\bforwards\b/);
      expect(decl).not.toMatch(/infinite|alternate/);
    }
    expect(parseInt(themeVar('--v2-settle-ms'), 10)).toBeLessThanOrEqual(5000);
    expect(noPref).toMatch(/@keyframes gg-orb-turn/);
  });

  it('keeps the nudge text at 4.5:1 or more against every pastel stop and the midpoint of each pair', () => {
    const text = themeVar('--color-v2-nudge-text');
    const stops = [...themeVar('--v2-nudge-bg').matchAll(/#[0-9a-f]{6}/gi)].map((m) => m[0]);
    expect(stops.length).toBeGreaterThanOrEqual(3);
    const mids = stops.slice(1).map((stop, i) => blend({ rgb: toRgb(stop), alpha: 0.5 }, stops[i]));
    for (const ground of [...stops, ...mids]) {
      expect({ ground, ok: contrast(text, ground) >= 4.5 }).toEqual({ ground, ok: true });
    }
  });

  it('uses no literal colours in the nudge rules, and defines every var they use', () => {
    const rules = nudgeRules.map((s) => decls(s, outside)).join('\n');
    expect(`${rules}\n${noPref}`).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
    const used = [...`${rules}\n${noPref}`.matchAll(/var\((--[\w-]+)\)/g)].map((m) => m[1]);
    expect(used.length).toBeGreaterThan(0);
    for (const name of new Set(used)) {
      expect(`${theme}\n${css}`, name).toMatch(new RegExp(`${name}:`));
    }
  });
});
