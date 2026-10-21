import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith('.ts') && !path.endsWith('.spec.ts') ? [path] : [];
  });
}

describe('key strings', () => {
  it('are built only in keys.ts', () => {
    const offenders = sourceFiles(__dirname)
      .filter((path) => !path.endsWith('/keys.ts'))
      .filter((path) => /(USER|FLOW|INVITE|MEMBER|TOKEN|REF)#\$\{|['"`](USER|REF|TOKEN)#/.test(readFileSync(path, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
