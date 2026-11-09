import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const css = readFileSync(join(import.meta.dirname, 'styles.css'), 'utf8');

type Rgb = [number, number, number];

function hexToRgb(hex: string): Rgb {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** WCAG 2.x relative luminance. */
function luminance([r, g, b]: Rgb): number {
  const [lr, lg, lb] = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** `alpha` of `fg` painted over `bg`, like color-mix(in srgb, fg alpha%, transparent) on bg. */
function over(fg: Rgb, alpha: number, bg: Rgb): Rgb {
  return fg.map((v, i) => v * alpha + bg[i] * (1 - alpha)) as Rgb;
}

function declared(name: string): string {
  const match = css.match(new RegExp(`^\\s*${name}:\\s*([^;]+);`, 'm'));
  expect(match, `${name} is declared`).not.toBeNull();
  return (match as RegExpMatchArray)[1].trim();
}

const SECTIONS = ['service', 'announcement', 'obituary', 'thanks'] as const;

/** The @theme token a `--tint-*` aliases, and the hex it resolves to. */
function resolveTint(section: string): { token: string; hex: string } {
  const alias = declared(`--tint-${section}`).match(/^var\(--color-([\w-]+)\)$/);
  expect(alias, `--tint-${section} is a var() alias of a colour`).not.toBeNull();
  const token = (alias as RegExpMatchArray)[1];
  return { token, hex: declared(`--color-${token}`) };
}

/** Follows a `var(--x)` alias until it reaches a hex value. */
function resolveHex(name: string): string {
  const value = declared(name);
  const alias = value.match(/^var\((--[\w-]+)\)$/);
  return alias ? resolveHex(alias[1]) : value;
}

const ink = hexToRgb(resolveHex('--color-text'));
const pageBg = hexToRgb(declared('--color-bg'));
const accent = hexToRgb(declared('--color-accent'));
const mutedAlpha = Number(declared('--text-muted').match(/(\d+)%/)?.[1]) / 100;
const hintAlpha = Number(declared('--text-hint').match(/(\d+)%/)?.[1]) / 100;

describe('section tints', () => {
  it('declares four different tints', () => {
    const hexes = SECTIONS.map((s) => resolveTint(s).hex);
    expect(new Set(hexes).size).toBe(4);
  });

  it.each(SECTIONS)('%s is a 100 or 200 step of accent, accent-2 or neutral', (section) => {
    expect(resolveTint(section).token).toMatch(/^(accent|accent-2|neutral)-(100|200)$/);
  });

  // The ring check is for the WEB-13 phone nudge, which will put a focusable control on these tints.
  it.each(SECTIONS)('%s: text, muted, hint and the focus ring are readable on it', (section) => {
    const bg = hexToRgb(resolveTint(section).hex);
    const ratios = {
      text: contrast(ink, bg),
      muted: contrast(over(ink, mutedAlpha, bg), bg),
      hint: contrast(over(ink, hintAlpha, bg), bg),
      ring: contrast(accent, bg),
    };
    expect(ratios.text).toBeGreaterThanOrEqual(4.5);
    expect(ratios.muted).toBeGreaterThanOrEqual(4.5);
    expect(ratios.hint).toBeGreaterThanOrEqual(4.5);
    expect(ratios.ring).toBeGreaterThanOrEqual(3);
  });

  it('text, muted and hint are readable on the page background the card now sits on', () => {
    expect(contrast(ink, pageBg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(over(ink, mutedAlpha, pageBg), pageBg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(over(ink, hintAlpha, pageBg), pageBg)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(SECTIONS)('%s differs from the page background (--color-bg)', (section) => {
    expect(resolveTint(section).hex).not.toBe(declared('--color-bg'));
  });
});
