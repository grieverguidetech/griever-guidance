import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

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

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.spec\./.test(name) ? [path] : [];
  });
}

const INLINE_OUTLINE_NONE = /outline\s*:\s*['"`]none['"`]|\boutline-none\b/;

function token(name: string): string {
  const match = CSS.match(new RegExp(`--color-${name}:\\s*(#[0-9a-f]{6})`, 'i'));
  if (!match) throw new Error(`token --color-${name} not found in styles.css`);
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

/** The colour token a declaration uses, e.g. `accent-700` from `var(--color-accent-700)`. */
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
    page: token('bg'),
    surface: token('surface'),
    'accent-100': token('accent-100'),
  };

  it('every script-focused target gets a bar that clears 3:1 on every background', () => {
    const declarations = rule("[tabindex='-1']:focus-visible");
    const bar = token(colourIn(declarations, 'box-shadow'));
    for (const [name, bg] of Object.entries(backgrounds)) {
      expect({ name, ratio: contrast(bar, bg) >= 3 }).toEqual({ name, ratio: true });
    }
  });

  it('a focused field gets a ring that clears 3:1 against the field, the page and its old border', () => {
    const declarations = rule('.gg-input:focus-visible');
    expect(declarations).not.toMatch(/outline:\s*none/);
    const ring = token(colourIn(declarations, 'outline'));
    expect(colourIn(declarations, 'border-color')).toBe(colourIn(declarations, 'outline'));
    // The unfocused border is --color-divider: ink at 16% over the field surface.
    const unfocusedBorder = over(token('ink'), 0.16, backgrounds.surface);
    for (const [name, bg] of Object.entries({ ...backgrounds, 'unfocused border': unfocusedBorder })) {
      expect({ name, ratio: contrast(ring, bg) >= 3 }).toEqual({ name, ratio: true });
    }
  });

  it('computes contrast the WCAG way', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    // Matches the measured value noted in styles.css for the base accent on the page.
    expect(contrast(token('accent'), token('bg'))).toBeCloseTo(3.65, 2);
  });
});
