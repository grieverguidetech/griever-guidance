import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Guard for the button hierarchy (#1064): three tiers, chosen by what the button does.
 * primary = action, secondary = navigation (outline), tertiary = suggestion (underlined link).
 * The retired classes, the retired libs/ui variants and the blue soft-ocean swirl must not come back.
 */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'node_modules' ? [] : sourceFiles(path);
    }
    const isSource = /\.(tsx?|css)$/.test(entry.name) && entry.name !== 'theme.generated.css';
    return isSource && !/\.spec\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

const roots = [resolve(__dirname), resolve(__dirname, '../../../libs/ui/src')];
const files = roots.flatMap(sourceFiles);

function offenders(pattern: RegExp): string[] {
  return files.flatMap((file) =>
    readFileSync(file, 'utf8')
      .split('\n')
      .map((text, index) => ({ text, line: index + 1 }))
      .filter(({ text }) => pattern.test(text))
      .map(({ line }) => `${file}:${line}`),
  );
}

describe('button tiers', () => {
  it('reads the web source and libs/ui', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it.each([
    ['the bar class', /gg-btn-bar/],
    ['the ghost class', /gg-btn-ghost/],
    ['the link-button class', /gg-link-button/],
  ])('uses no retired class: %s', (_name, pattern) => {
    expect(offenders(pattern)).toEqual([]);
  });

  it.each(['header', 'tinted', 'ghost'])('uses no retired libs/ui variant: %s', (variant) => {
    expect(offenders(new RegExp(`variant=["'{]+${variant}\\b|variant:\\s*["']${variant}["']`))).toEqual([]);
  });

  it('draws no blue soft-ocean swirl on web', () => {
    const css = readFileSync(resolve(__dirname, 'styles.css'), 'utf8');
    expect(css).not.toMatch(/secondary-bg|secondary-shadow|soft-?ocean/i);
  });
});
