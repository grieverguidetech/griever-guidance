import { describe, expect, it } from '@jest/globals';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const mobileRoot = join(__dirname, '..', '..');
const skipped = new Set(['node_modules', 'dist', 'out-tsc', '.expo', 'coverage']);

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
  it('nothing under apps/mobile refers to @griever/ui', () => {
    const offenders = listFiles(mobileRoot)
      .filter((path) => !path.endsWith('noWebUi.spec.ts'))
      .filter((path) => readFileSync(path, 'utf8').includes('@griever/ui'))
      .map((path) => path.slice(mobileRoot.length + 1));
    expect(offenders).toEqual([]);
  });
});
