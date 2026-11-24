import { describe, expect, it } from '@jest/globals';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Guard for the button hierarchy (#1065): three tiers, chosen by what the button does.
 * primary = action, secondary = navigation (outline), tertiary = suggestion (underlined link).
 * The retired variants (header, tinted, ghost) and the blue soft-ocean swirl must not come back.
 */
const RETIRED_VARIANT = (name: string) => new RegExp(`variant=["'{]+${name}\\b|variant:\\s*["']${name}["']|variant\\s*===\\s*["']${name}["']`);
const SOFT_OCEAN = /softOcean|roles\.soft\b|recipes\.button\.secondary|secondary-bg/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'node_modules' ? [] : sourceFiles(path);
    }
    return /\.tsx?$/.test(entry.name) && !/\.spec\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

function offendingLines(source: string, pattern: RegExp): number[] {
  return source
    .split('\n')
    .map((text, index) => ({ text, line: index + 1 }))
    .filter(({ text }) => pattern.test(text))
    .map(({ line }) => line);
}

const files = sourceFiles(resolve(__dirname, '..'));

function offenders(pattern: RegExp): string[] {
  return files.flatMap((file) => offendingLines(readFileSync(file, 'utf8'), pattern).map((line) => `${file}:${line}`));
}

describe('button tiers (mobile)', () => {
  it('reads the mobile source', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it.each(['header', 'tinted', 'ghost'])('uses no retired variant: %s', (name) => {
    expect(offenders(RETIRED_VARIANT(name))).toEqual([]);
  });

  it('draws no blue soft-ocean swirl', () => {
    expect(offenders(SOFT_OCEAN)).toEqual([]);
  });

  describe('the guard itself', () => {
    it.each([
      '<Button label="Back" variant="header" onPress={f} />',
      "<Button label='Back' variant='tinted' onPress={f} />",
      '<Button label="Skip" variant={"ghost"} onPress={f} />',
      "const props = { variant: 'header' };",
    ])('catches a retired variant: %s', (line) => {
      const hit = ['header', 'tinted', 'ghost'].some((name) => offendingLines(line, RETIRED_VARIANT(name)).length > 0);
      expect(hit).toBe(true);
    });

    it.each([
      '<Button label="Back" variant="secondary" onPress={f} />',
      '<Button label="Skip" variant="tertiary" onPress={f} />',
      '<Text accessibilityRole="header">Title</Text>',
      '<Button label="Go" onPress={f} />',
    ])('lets a current tier through: %s', (line) => {
      const hit = ['header', 'tinted', 'ghost'].some((name) => offendingLines(line, RETIRED_VARIANT(name)).length > 0);
      expect(hit).toBe(false);
    });

    it.each(['v2.primitives.gradients.softOcean', 'const swirl = v2.roles.soft;', 'v2.recipes.button.secondary.swirl', 'var(--v2-secondary-bg)'])(
      'catches the soft-ocean swirl: %s',
      (line) => {
        expect(offendingLines(line, SOFT_OCEAN)).toEqual([1]);
      },
    );

    it.each(['v2.recipes.button.outline', 'v2.recipes.button.primary.swirl', 'const soft = 1;'])('lets a current recipe through: %s', (line) => {
      expect(offendingLines(line, SOFT_OCEAN)).toEqual([]);
    });
  });
});
