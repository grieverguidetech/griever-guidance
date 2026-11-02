import { describe, expect, it } from '@jest/globals';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const mobileRoot = join(__dirname, '..', '..');
const skipped = new Set(['node_modules', 'dist', 'out-tsc', '.expo', 'coverage', 'ios', 'android']);

/** True when the source names the web UI package, or reaches into libs/ui by a relative path. */
export function reachesWebUi(source: string): boolean {
  if (source.includes('@griever/ui')) {
    return true;
  }
  return /from\s+['"][^'"]*libs\/ui\//.test(source) || /require\(\s*['"][^'"]*libs\/ui\//.test(source) || /import\(\s*['"][^'"]*libs\/ui\//.test(source);
}

function listFiles(dir: string): string[] {
  const found: string[] = [];
  for (const name of readdirSync(dir)) {
    if (skipped.has(name)) {
      continue;
    }
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      found.push(...listFiles(path));
    } else if (/\.(tsx?|jsx?|json|cjs|mjs)$/.test(name)) {
      found.push(path);
    }
  }
  return found;
}

describe('mobile UI is its own (REQUIREMENTS.md section 6)', () => {
  it('nothing under apps/mobile reaches the web UI', () => {
    const offenders = listFiles(mobileRoot)
      .filter((path) => !path.endsWith('noWebUi.spec.ts'))
      .filter((path) => reachesWebUi(readFileSync(path, 'utf8')))
      .map((path) => path.slice(mobileRoot.length + 1));
    expect(offenders).toEqual([]);
  });

  it('the matcher catches the package name and relative paths into libs/ui', () => {
    expect(reachesWebUi("import { Button } from '@griever/ui';")).toBe(true);
    expect(reachesWebUi("import { Button } from '../../../../libs/ui/src/index';")).toBe(true);
    expect(reachesWebUi('const ui = require("../../libs/ui/src");')).toBe(true);
    expect(reachesWebUi("const ui = await import('../libs/ui/src');")).toBe(true);
    expect(reachesWebUi("import { Button } from './Button';")).toBe(false);
    expect(reachesWebUi("import { x } from '../libs/uikit/src';")).toBe(false);
  });
});
