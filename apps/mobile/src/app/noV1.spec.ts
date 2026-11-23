import { describe, expect, it } from '@jest/globals';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const srcRoot = join(__dirname, '..');
const folders = ['components', 'screens', 'app'];

function listFiles(dir: string): string[] {
  const found: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      found.push(...listFiles(path));
    } else if (/\.tsx?$/.test(name)) {
      found.push(path);
    }
  }
  return found;
}

/** True when the source imports v1 `colors` or `radius` from @griever/tokens. */
export function importsV1(source: string): boolean {
  const imports = source.match(/import\s+(?:type\s+)?\{[^}]*\}\s+from\s+['"]@griever\/tokens['"]/g) ?? [];
  return imports.some((statement) => /(^|[\s{,])(colors|radius)\s*(,|\}|as\b)/.test(statement));
}

describe('mobile components, screens and app read v2 roles (#1009)', () => {
  it('detects a v1 import', () => {
    expect(importsV1("import { colors, spacing } from '@griever/tokens';")).toBe(true);
    expect(importsV1("import { spacing, radius } from '@griever/tokens';")).toBe(true);
    expect(importsV1("import { spacing, v2 } from '@griever/tokens';")).toBe(false);
  });

  it('no file in components, screens or app imports v1 colors or radius', () => {
    const offenders = folders
      .flatMap((folder) => listFiles(join(srcRoot, folder)))
      .filter((path) => !path.endsWith('noV1.spec.ts'))
      .filter((path) => importsV1(readFileSync(path, 'utf8')))
      .map((path) => path.slice(srcRoot.length + 1));
    expect(offenders).toEqual([]);
  });
});
