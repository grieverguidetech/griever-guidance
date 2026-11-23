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

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

/** True when the source takes v1 `colors` or `radius` from @griever/tokens, by any path or form. */
function importsV1(raw: string): boolean {
  const source = withoutComments(raw);
  const statements = source.matchAll(/\b(?:import|export)\s+(?:type\s+)?([^;'"]*?)\s*from\s*['"]([^'"]+)['"]/g);
  for (const [, clause, path] of statements) {
    if (!/^@griever\/tokens(\/|$)/.test(path) && !path.includes('libs/tokens')) {
      continue;
    }
    const namespace = clause.match(/\*\s*as\s+(\w+)/);
    if (namespace) {
      if (new RegExp(`\\b${namespace[1]}\\.(colors|radius)\\b`).test(source)) {
        return true;
      }
      continue;
    }
    if (/(^|[\s{,])(colors|radius)\s*(,|\}|\bas\b|$)/.test(clause)) {
      return true;
    }
  }
  return false;
}

describe('mobile components, screens and app read v2 roles (#1009)', () => {
  it('detects a v1 import', () => {
    expect(importsV1("import { colors, spacing } from '@griever/tokens';")).toBe(true);
    expect(importsV1("import { spacing, radius } from '@griever/tokens';")).toBe(true);
    expect(importsV1("import { colors as c } from '@griever/tokens';")).toBe(true);
    expect(importsV1("import {\n  spacing,\n  colors,\n} from '@griever/tokens';")).toBe(true);
    expect(importsV1("import { colors } from '@griever/tokens/src/index';")).toBe(true);
    expect(importsV1("import { radius } from '../../../../libs/tokens/src/index';")).toBe(true);
    expect(importsV1("import * as t from '@griever/tokens';\nconst x = t.colors.ink;")).toBe(true);
    expect(importsV1("export { radius } from '@griever/tokens';")).toBe(true);
  });

  it('allows v2 and look-alikes', () => {
    expect(importsV1("import { spacing, v2 } from '@griever/tokens';")).toBe(false);
    expect(importsV1("import { colorsX } from '@griever/tokens';")).toBe(false);
    expect(importsV1("import { v2 } from '@griever/tokens';\n// colors, radius from @griever/tokens")).toBe(false);
    expect(importsV1("// import { colors } from '@griever/tokens';\nimport { v2 } from '@griever/tokens';")).toBe(false);
    expect(importsV1("import * as t from '@griever/tokens';\nconst x = t.v2;")).toBe(false);
    expect(importsV1("import { colors } from './colors';")).toBe(false);
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
