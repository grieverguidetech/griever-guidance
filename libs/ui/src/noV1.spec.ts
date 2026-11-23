import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const srcRoot = import.meta.dirname;

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
  // Only whole-line // comments, so a URL string such as 'http://x' is left alone.
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** True when the source holds a hex colour literal such as '#abc' or '1px solid #b91c1c'. */
function hasHexColour(raw: string): boolean {
  return /#[0-9a-fA-F]{3,8}\b/.test(withoutComments(raw));
}

function isTokensPath(path: string): boolean {
  return /^@griever\/tokens(\/|$)/.test(path) || path.includes('libs/tokens') || /(^|\/)tokens\/src(\/|$)/.test(path);
}

/** True when the source takes v1 `colors` or `radius` from @griever/tokens, by any path or form. */
function importsV1(raw: string): boolean {
  const source = withoutComments(raw);
  const statements = source.matchAll(/\b(?:import|export)\s+(?:type\s+)?([^;'"]*?)\s*from\s*['"]([^'"]+)['"]/g);
  for (const [, clause, path] of statements) {
    if (!isTokensPath(path)) {
      continue;
    }
    // A barrel re-export hands v1 to the next importer.
    if (/^\*$/.test(clause.trim())) {
      return true;
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

describe('libs/ui reads v2 roles (#1007)', () => {
  it('detects a v1 import', () => {
    expect(importsV1("import { colors, spacing } from '@griever/tokens';")).toBe(true);
    expect(importsV1("import { spacing, radius } from '@griever/tokens';")).toBe(true);
    expect(importsV1("import { colors as c } from '@griever/tokens';")).toBe(true);
    expect(importsV1("import {\n  spacing,\n  colors,\n} from '@griever/tokens';")).toBe(true);
    expect(importsV1("import { colors } from '@griever/tokens/src/index';")).toBe(true);
    expect(importsV1("import { radius } from '../../../../libs/tokens/src/index';")).toBe(true);
    expect(importsV1("import * as t from '@griever/tokens';\nconst x = t.colors.ink;")).toBe(true);
    expect(importsV1("export { radius } from '@griever/tokens';")).toBe(true);
    expect(importsV1("import { colors } from '../../tokens/src';")).toBe(true);
    expect(importsV1("import { colors } from '../../tokens/src/index';")).toBe(true);
    expect(importsV1("import { radius } from '../../../tokens/src';")).toBe(true);
    expect(importsV1("export * from '@griever/tokens';")).toBe(true);
  });

  it('keeps a v1 import visible after a URL string', () => {
    expect(importsV1("const u = 'http://x';\nimport { colors } from '@griever/tokens';")).toBe(true);
  });

  it('finds a hex colour in any string, and ignores comments and a lone #', () => {
    expect(hasHexColour('const a = `#abcdef`;')).toBe(true);
    expect(hasHexColour("const a = '1px solid #b91c1c';")).toBe(true);
    expect(hasHexColour('const a = `inset 0 0 0 2px #006786`;')).toBe(true);
    expect(hasHexColour("const a = '#abc';")).toBe(true);
    expect(hasHexColour('const a = "#abcdef";')).toBe(true);
    expect(hasHexColour('// the old #b91c1c red\nconst a = 1;')).toBe(false);
    expect(hasHexColour('/* #abcdef */ const a = 1;')).toBe(false);
    expect(hasHexColour("const a = '#';")).toBe(false);
  });

  it('allows v2 and look-alikes', () => {
    expect(importsV1("import { spacing, v2 } from '@griever/tokens';")).toBe(false);
    expect(importsV1("import { colorsX } from '@griever/tokens';")).toBe(false);
    expect(importsV1("import { v2 } from '@griever/tokens';\n// colors, radius from @griever/tokens")).toBe(false);
    expect(importsV1("// import { colors } from '@griever/tokens';\nimport { v2 } from '@griever/tokens';")).toBe(false);
    expect(importsV1("import * as t from '@griever/tokens';\nconst x = t.v2;")).toBe(false);
    expect(importsV1("import { colors } from './colors';")).toBe(false);
  });

  it('no file in libs/ui imports v1 colors or radius', () => {
    const offenders = listFiles(srcRoot)
      .filter((path) => !path.endsWith('noV1.spec.ts'))
      .filter((path) => importsV1(readFileSync(path, 'utf8')))
      .map((path) => path.slice(srcRoot.length + 1));
    expect(offenders).toEqual([]);
  });

  it('no source file in libs/ui hard-codes a hex colour; colours come from v2', () => {
    const offenders = listFiles(srcRoot)
      .filter((path) => !/\.spec\.tsx?$/.test(path))
      .filter((path) => hasHexColour(readFileSync(path, 'utf8')))
      .map((path) => path.slice(srcRoot.length + 1));
    expect(offenders).toEqual([]);
  });
});
