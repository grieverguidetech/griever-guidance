import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { v2 } from '@griever/tokens';

/**
 * #162: focus stays visible (WCAG 2.4.7) and the indicator clears 3:1 (WCAG 1.4.11).
 * jsdom can't evaluate :focus-visible or paint, so this guards the source instead:
 * - no screen hides the focus ring with an inline `outline: 'none'` (or Tailwind's
 *   `outline-none`), which beats every stylesheet rule;
 * - styles.css styles every script-focused target ([tabindex='-1']) and fields with a colour
 *   that is at least 3:1 against every background it can sit on, computed from the tokens.
 */
const SRC = import.meta.dirname;
const CSS = readFileSync(join(SRC, 'styles.css'), 'utf8');
// The colour tokens live in the generated theme file (from @griever/tokens).
const THEME = readFileSync(join(SRC, 'theme.generated.css'), 'utf8');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.spec\./.test(name) ? [path] : [];
  });
}

const INLINE_OUTLINE_NONE = /outline\s*:\s*['"`]none['"`]|\boutline-none\b/;

function token(name: string): string {
  const match = THEME.match(new RegExp(`--color-${name}:\\s*(#[0-9a-f]{6})`, 'i'));
  if (!match) throw new Error(`token --color-${name} not found in theme.generated.css`);
  return match[1];
}

/** WCAG 2.x relative luminance and contrast ratio. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
/** `color-mix(in srgb, fg <alpha>, transparent)` painted over an opaque background. */
function over(fg: string, alpha: number, bg: string): string {
  const channel = (hex: string, i: number) => parseInt(hex.slice(i, i + 2), 16);
  return (
    '#' +
    [1, 3, 5]
      .map((i) => Math.round(channel(fg, i) * alpha + channel(bg, i) * (1 - alpha)))
      .map((c) => c.toString(16).padStart(2, '0'))
      .join('')
  );
}

/** The declarations of the unlayered rule whose selector is exactly `selector`. */
function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = CSS.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`rule ${selector} not found in styles.css`);
  return match[1];
}

/** The colour token a declaration uses, e.g. `v2-link` from `var(--color-v2-link)`. */
function colourIn(declarations: string, property: string): string {
  const match = declarations.match(new RegExp(`${property}:[^;]*var\\(--color-([a-z0-9-]+)\\)`));
  if (!match) throw new Error(`${property} has no colour token in: ${declarations}`);
  return match[1];
}

describe('visible focus (#162)', () => {
  it('flags an inline outline: none and the outline-none utility', () => {
    expect(INLINE_OUTLINE_NONE.test("style={{ outline: 'none' }}")).toBe(true);
    expect(INLINE_OUTLINE_NONE.test('className="outline-none p-2"')).toBe(true);
    expect(INLINE_OUTLINE_NONE.test('peer-focus-visible:outline-2')).toBe(false);
  });

  it('no web source hides the focus ring inline', () => {
    const files = sourceFiles(SRC);
    expect(files.length).toBeGreaterThan(5);
    const found = files.flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .filter((line) => INLINE_OUTLINE_NONE.test(line))
        .map((line) => `${relative(SRC, file)}: ${line.trim()}`),
    );
    expect(found).toEqual([]);
  });

  const backgrounds = {
    page: token('v2-page'),
    surface: token('v2-field-fill'),
    wash: token('v2-wash'),
  };

  it('every script-focused target gets a bar that clears 3:1 on every background', () => {
    const declarations = rule("[tabindex='-1']:focus-visible");
    const bar = token(colourIn(declarations, 'box-shadow'));
    for (const [name, bg] of Object.entries(backgrounds)) {
      expect({ name, ratio: contrast(bar, bg) >= 3 }).toEqual({ name, ratio: true });
    }
  });

  it('the phone nudge takes focus with no visible ring and keeps the nudge shadow (#803, #1003)', () => {
    const declarations = rule('.gg-phone-nudge:focus,\n.gg-phone-nudge:focus-visible');
    expect(declarations).toMatch(/outline:\s*2px solid transparent/);
    expect(declarations).toMatch(/box-shadow:\s*var\(--v2-nudge-shadow\)/);
    expect(declarations).not.toMatch(/--shadow-md/);
    expect(declarations).not.toMatch(/v2-link/);
  });

  it('the phone nudge rule comes after the generic tabindex rule, since source order decides (#803)', () => {
    const generic = CSS.indexOf("[tabindex='-1']:focus-visible {");
    const nudge = CSS.indexOf('.gg-phone-nudge:focus,');
    expect(generic).toBeGreaterThanOrEqual(0);
    expect(nudge).toBeGreaterThan(generic);
  });

  it('a focused field gets a ring that clears 3:1 against the field, the page and its old border', () => {
    const declarations = rule('.gg-input:focus-visible');
    expect(declarations).not.toMatch(/outline:\s*none/);
    const ring = token(colourIn(declarations, 'outline'));
    expect(colourIn(declarations, 'border-color')).toBe(colourIn(declarations, 'outline'));
    // The unfocused border is --color-v2-divider: ink at 16% over the field surface.
    const unfocusedBorder = over(token('text'), 0.16, backgrounds.surface);
    for (const [name, bg] of Object.entries({ ...backgrounds, 'unfocused border': unfocusedBorder })) {
      expect({ name, ratio: contrast(ring, bg) >= 3 }).toEqual({ name, ratio: true });
    }
  });

  // #514, now on the v2 field recipe (#1000): the edge clears 3:1 against its own fill. The glass
  // panel grounds are covered in v2Styles.spec.ts.
  it('an input on a panel gets a border that clears 3:1 against its fill (#514, #1000)', () => {
    const match = CSS.match(/\.gg-panel \.gg-input\s*\{([^}]*)\}/);
    if (!match) {
      throw new Error('rule .gg-panel .gg-input not found in styles.css');
    }
    expect(match[1]).toContain('border-color: var(--color-v2-field-edge)');
    expect(match[1]).toContain('background: var(--color-v2-field-fill)');
    expect(contrast(v2.recipes.field.edge, v2.recipes.field.fill)).toBeGreaterThanOrEqual(3);
  });

  // #1005: the global ring, the selected card's focus ring and the datebox trigger use the v2 focus colour.
  describe('v2 focus ring (#1005)', () => {
    const focus = token('v2-focus');
    const grounds = { page: token('v2-page'), 'glow-sun': token('v2-glow-sun'), 'glow-sky': token('v2-glow-sky') };
    const glassFill = THEME.match(/--color-v2-card-fill:\s*rgba\(\s*255,\s*255,\s*255,\s*([\d.]+)\s*\)/);
    const glassAlpha = Number(glassFill?.[1]);
    const glassOver = (ground: string) => over('#ffffff', glassAlpha, ground);
    const ink = token('ink');
    // The row and chip fill under the pointer: 7% (hover) or 14% (active) of the text colour, over glass.
    const washes = [0.07, 0.14];
    const datebox = CSS.match(/\.gg-datebox-trigger:focus-visible\s*\{([^}]*)\}/)?.[1] ?? '';

    it('points each changed ring at --color-v2-focus', () => {
      expect(rule(':focus-visible')).toContain('outline: 2px solid var(--color-v2-focus)');
      expect(rule('.gg-card-selected:focus')).toContain('outline: 2px solid var(--color-v2-focus)');
      expect(datebox).toContain('outline: 2px solid var(--color-v2-focus)');
    });

    it('keeps the deliberate exceptions on their own colours', () => {
      expect(rule('.gg-input:focus-visible')).toContain('var(--color-v2-link)');
      expect(rule('[data-gg-field]:focus-visible')).toContain('var(--color-v2-link)');
      expect(rule('.gg-card-selected:focus-visible')).toContain('var(--color-v2-link)');
      expect(CSS).toContain('.gg-btn-primary:focus-visible');
      expect(CSS).toMatch(/\[data-gg-btn='secondary'\]:focus-visible \{ outline-color: var\(--color-v2-link\); \}/);
      expect(rule('.gg-phone-nudge:focus,\n.gg-phone-nudge:focus-visible')).toContain('outline: 2px solid transparent');
    });

    it.each(Object.entries(grounds))('clears 3:1 on %s, on glass over it and on the 7% and 14% washes over that glass', (_name, ground) => {
      const glass = glassOver(ground);
      const sits = [ground, glass, ...washes.map((alpha) => over(ink, alpha, glass))];
      for (const bg of sits) {
        expect({ bg, ok: contrast(focus, bg) >= 3 }).toEqual({ bg, ok: true });
      }
    });

    it('clears 3:1 on the field fill and on the datebox hover wash (12% accent) over it', () => {
      const field = token('v2-field-fill');
      const hover = over(token('v2-focus'), 0.12, field);
      expect(contrast(focus, field)).toBeGreaterThanOrEqual(3);
      expect(contrast(focus, hover)).toBeGreaterThanOrEqual(3);
    });

    it('draws the segmented control ring inset, in the page colour on the active option', () => {
      // .gg-seg clips its children, and the active option is filled with the focus colour itself.
      const inset = CSS.match(/\.gg-seg-opt:focus-visible\s*\{([^}]*)\}/)?.[1] ?? '';
      const active = CSS.match(/\.gg-seg-opt-active:focus-visible\s*\{([^}]*)\}/)?.[1] ?? '';
      expect(inset).toMatch(/outline-offset:\s*-\d+px/);
      expect(active).toContain('outline-color: var(--color-v2-page)');
      expect(contrast(token('v2-page'), token('v2-link'))).toBeGreaterThanOrEqual(3);
      expect(contrast(focus, token('v2-page'))).toBeGreaterThanOrEqual(3);
    });

    it('uses no literal colours in the changed ring rules', () => {
      const rules = [rule(':focus-visible'), rule('.gg-card-selected:focus'), datebox].join('\n');
      expect(rules).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
    });
  });

  it('computes contrast the WCAG way', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    // Matches the measured value noted in styles.css for the base accent on the page.
    expect(contrast(token('accent'), token('bg'))).toBeCloseTo(3.65, 2);
  });
});
