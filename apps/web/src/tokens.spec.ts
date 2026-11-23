import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { colors, fontSerifStack, radius, spacing, toGeneratedFile, v2 } from '@griever/tokens';

const read = (name: string) => readFileSync(join(import.meta.dirname, name), 'utf8');

/** A v1 colour custom property, e.g. `--color-accent-700` or `--color-bg`. v2 names (`--color-v2-*`) never match. */
const V1_VAR = /--color-(accent|neutral|success|surface|bg|white|ink|error|divider)(?![a-z])/;
/** A v1 Tailwind colour utility (text, bg, border and the like, with accent, neutral, surface, ink and so on). */
const V1_UTILITY = /\b(bg|text|border|ring|fill|stroke|outline|divide|placeholder|caret|decoration|from|to|via)-(accent|neutral|success|surface|ink|bg|white)(-[0-9]+)?\b/;

function usesV1Colour(source: string): boolean {
  return V1_VAR.test(source) || V1_UTILITY.test(source);
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

/** v1 is deleted (#981): web reads colour only through the v2 roles and --color-text. */
describe('no v1 colour in web source (#1006)', () => {
  it('flags a v1 var and a v1 utility', () => {
    expect(usesV1Colour('color: var(--color-accent-700)')).toBe(true);
    expect(usesV1Colour('x: var(--color-bg)')).toBe(true);
    expect(usesV1Colour('--color-success-700')).toBe(true);
    // Built from parts so Tailwind does not emit these dead classes into the app CSS.
    const utility = (...parts: string[]) => parts.join('-');
    expect(usesV1Colour(`className="${utility('text', 'accent', '700')}"`)).toBe(true);
    expect(usesV1Colour(`hover:${utility('bg', 'surface')}`)).toBe(true);
    expect(usesV1Colour(utility('border', 'neutral', '600'))).toBe(true);
  });

  it('accepts the v2 roles and the shared text colour', () => {
    expect(usesV1Colour('color: var(--color-v2-link)')).toBe(false);
    expect(usesV1Colour('background: var(--color-v2-field-fill)')).toBe(false);
    expect(usesV1Colour('color: var(--color-text)')).toBe(false);
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
