import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * #152: import each Phosphor icon from its own path (`@phosphor-icons/react/CheckCircle`),
 * never from the package root. The root re-exports about 1,500 icons (3,000 modules), and
 * loading it cost about 2 s of CPU in every web spec file that renders a screen. Under load
 * that pushed whole-App specs past Vitest's 5 s timeout (Nx flagged web:test as flaky).
 */
const SRC = import.meta.dirname;
const BARREL = /from\s+['"]@phosphor-icons\/react['"]/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.spec\./.test(name) ? [path] : [];
  });
}

describe('Phosphor icons are imported one by one (#152)', () => {
  it('spots a root import', () => {
    expect(BARREL.test("import { Plus } from '@phosphor-icons/react';")).toBe(true);
    expect(BARREL.test("import { Plus } from '@phosphor-icons/react/Plus';")).toBe(false);
  });

  it('no web source file imports the package root', () => {
    const offenders = sourceFiles(SRC)
      .filter((path) => BARREL.test(readFileSync(path, 'utf8')))
      .map((path) => relative(SRC, path));
    expect(offenders).toEqual([]);
  });
});
