import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { spacing, toGeneratedFile, v2 } from '@griever/tokens';

const read = (name: string) => readFileSync(join(import.meta.dirname, name), 'utf8');

/** A v1 colour custom property: the `--color-` prefix with a v1 family name (accent, neutral, success, surface, bg, white, ink, error, divider). v2 names (`--color-v2-*`) never match. */
const V1_VAR = /--color-(accent|neutral|success|surface|bg|white|ink|error|divider)(?![a-z])/;
/** A v1 Tailwind colour utility: a colour prefix (border sides, ring-offset, inset-ring, shadow, accent and so on) with a v1 family name. */
const V1_UTILITY = /\b(bg|text|border(-[xytrbl])?|ring(-offset)?|inset-ring|shadow|accent|fill|stroke|outline|divide|placeholder|caret|decoration|from|to|via)-(accent|neutral|success|surface|ink|bg|white)(-[0-9]+)?\b/;
/** A web spec reading a v1 token by name, e.g. token('ink') or token('accent-700'). */
const V1_TOKEN_CALL = /\btoken\('(ink|bg|surface|white|error|divider|(accent|accent-2|neutral|success)(-[0-9]+)?)'\)/;

/** Joins parts with dashes. Used so a spec string never holds a whole Tailwind class or deleted var name that Tailwind would scan into the build. */
const dash = (...parts: string[]) => parts.join('-');
/** `--` plus the parts, dashed. */
const varName = (...parts: string[]) => `--${dash(...parts)}`;
/** A deleted v1 theme var: the radius family or the serif font var. */
const deletedVar = new RegExp(`--(radius-|${dash('font', 'serif')})`);

function usesV1Colour(source: string): boolean {
  return V1_VAR.test(source) || V1_UTILITY.test(source) || V1_TOKEN_CALL.test(source);
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      return sourceFiles(path);
    }
    return /\.(ts|tsx|css)$/.test(entry) ? [path] : [];
  });
}

/** @griever/tokens is the source for the web theme; a hand edit or a stale file fails here. */
describe('tokens match the web theme', () => {
  const generated = read('theme.generated.css');

  it('theme.generated.css equals toGeneratedFile of the spacing and v2 tokens, header included', () => {
    expect(generated).toBe(toGeneratedFile({ spacing, v2 }));
  });

  it('theme.generated.css holds no v1 var (#1010)', () => {
    expect(generated).not.toMatch(deletedVar);
    expect(generated).not.toMatch(/--color-(accent|neutral|success|surface|bg|white|ink)/);
  });

  it('styles.css imports the generated file and declares no token of its own', () => {
    const css = read('styles.css');
    expect(css).toContain("@import './theme.generated.css';");
    expect(css).not.toContain('@theme {');
    const names = [
      varName('font', 'serif'),
      ...Object.keys(spacing).map((name) => `--space-${name}`),
      varName('radius', 'sm'),
      varName('radius', 'md'),
      varName('radius', 'lg'),
    ];
    for (const name of names) {
      expect(css, `${name} is declared in styles.css`).not.toMatch(new RegExp(`${name}\\s*:`));
    }
    // A new family of generated tokens must not be hand-declared either.
    expect(css).not.toMatch(/--(space|radius)-[\w-]+\s*:/);
    // Nothing in styles.css reads a deleted var either.
    expect(css).not.toMatch(new RegExp(`var\\(${deletedVar.source}`));
  });
});

/** Tailwind's own `rounded-*` steps read its default radius vars, not our tokens (#1010). Web uses `--v2-radius`. */
const TAILWIND_ROUNDED =
  /(?<![\w-])rounded(-(s|e|t|r|b|l|ss|se|ee|es|tl|tr|br|bl))?(-(xs|sm|md|lg|xl|2xl|3xl|4xl))?(?![\w[-])/;

// styles.css has `@source not` for specs, so these strings can be written plainly.
describe('no Tailwind default radius in web source (#1010)', () => {
  it('flags a stock rounded step, a bare rounded and a side form', () => {
    for (const cls of [
      'rounded',
      'rounded-xs',
      'rounded-md',
      'rounded-4xl',
      'rounded-t',
      'rounded-t-lg',
      'rounded-tl-xl',
      'rounded-ss',
      'flex rounded-md p-2',
      'hover:rounded-lg',
      'className="rounded"',
    ]) {
      expect(TAILWIND_ROUNDED.test(cls), cls).toBe(true);
    }
  });

  it('accepts the token corner, a literal corner, full and none', () => {
    for (const cls of [
      'rounded-[var(--v2-radius)]',
      'rounded-[2px]',
      'rounded-t-[2px]',
      'rounded-full',
      'rounded-none',
      'rounded-t-none',
      'gg-rounded-md',
    ]) {
      expect(TAILWIND_ROUNDED.test(cls), cls).toBe(false);
    }
  });

  it('styles.css keeps specs out of the Tailwind scan', () => {
    expect(read('styles.css')).toContain('@source not "./**/*.spec.{ts,tsx}";');
  });

  it('finds none in apps/web/src, outside this guard', () => {
    const offenders = sourceFiles(import.meta.dirname)
      .filter((file) => !file.endsWith('theme.generated.css') && !file.endsWith('tokens.spec.ts'))
      .filter((file) => TAILWIND_ROUNDED.test(readFileSync(file, 'utf8')))
      .map((file) => relative(import.meta.dirname, file));
    expect(offenders).toEqual([]);
  });
});

/** v1 is deleted (#981): web reads colour only through the v2 roles and --color-text. */
describe('no v1 colour in web source (#1006)', () => {
  it('flags a v1 var and a v1 utility', () => {
    // Built from parts so Tailwind does not scan these strings and keep the v1 vars or classes in the app CSS.
    const v = (name: string) => ['-', '-color-', name].join('');
    expect(usesV1Colour(`color: var(${v('accent-700')})`)).toBe(true);
    expect(usesV1Colour(`x: var(${v('bg')})`)).toBe(true);
    expect(usesV1Colour(v('success-700'))).toBe(true);
    expect(usesV1Colour(`token('${['in', 'k'].join('')}')`)).toBe(true);
    expect(usesV1Colour(`token('${['accent', '700'].join('-')}')`)).toBe(true);
    const utility = (...parts: string[]) => parts.join('-');
    expect(usesV1Colour(utility('border', 't', 'neutral', '600'))).toBe(true);
    expect(usesV1Colour(utility('ring', 'offset', 'surface'))).toBe(true);
    expect(usesV1Colour(utility('shadow', 'accent', '700'))).toBe(true);
    expect(usesV1Colour(utility('inset', 'ring', 'success', '700'))).toBe(true);
    expect(usesV1Colour(utility('accent', 'accent', '700'))).toBe(true);
    expect(usesV1Colour(`className="${utility('text', 'accent', '700')}"`)).toBe(true);
    expect(usesV1Colour(`hover:${utility('bg', 'surface')}`)).toBe(true);
    expect(usesV1Colour(utility('border', 'neutral', '600'))).toBe(true);
  });

  it('accepts the v2 roles and the shared text colour', () => {
    expect(usesV1Colour('color: var(--color-v2-link)')).toBe(false);
    expect(usesV1Colour('background: var(--color-v2-field-fill)')).toBe(false);
    expect(usesV1Colour('color: var(--color-text)')).toBe(false);
    expect(usesV1Colour("token('text') token('v2-focus')")).toBe(false);
    expect(usesV1Colour('className="bg-v2-wash text-v2-success"')).toBe(false);
  });

  it('finds none in apps/web/src, outside the generated theme and this guard', () => {
    const offenders = sourceFiles(import.meta.dirname)
      .filter((file) => !file.endsWith('theme.generated.css') && !file.endsWith('tokens.spec.ts'))
      .filter((file) => usesV1Colour(readFileSync(file, 'utf8')))
      .map((file) => relative(import.meta.dirname, file));
    expect(offenders).toEqual([]);
  });
});
