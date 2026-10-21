import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * C7: no exclamation points in user-facing copy on either app. This scans the screen and
 * app source of apps/web and apps/mobile for text that ends in "!" right before a quote,
 * a tag or the end of a line (JSX text and string literals), after dropping comments.
 * It is a guard, not a parser: it won't see copy built from pieces, so the template copy is
 * checked separately in libs/shared (copyTone.spec.ts).
 */
const ROOT = join(import.meta.dirname, '..', '..', '..');
const DIRS = ['apps/web/src', 'apps/mobile/src'];
// Words or digits (or closing punctuation) followed by "!" and then the end of the text.
const BANG_IN_TEXT = /[\p{L}\p{N}.,')]!(?=['"`<{]|\s*$)/u;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    const isSource = /\.(ts|tsx)$/.test(name) && !/\.spec\./.test(name);
    return isSource ? [path] : [];
  });
}

function withoutComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function findBangs(text: string): string[] {
  return withoutComments(text)
    .split('\n')
    .filter((line) => BANG_IN_TEXT.test(line))
    .map((line) => line.trim());
}

describe('user-facing copy has no exclamation points (C7)', () => {
  it('flags a "!" in JSX text and in string literals', () => {
    expect(findBangs('<p>Welcome!</p>')).toHaveLength(1);
    expect(findBangs("const msg = 'All done!';")).toHaveLength(1);
  });

  it('leaves code, comments and not-equal operators alone', () => {
    expect(findBangs('if (!ready) return;')).toEqual([]);
    expect(findBangs('const x = a !== b;')).toEqual([]);
    expect(findBangs('// Careful!\nconst x = 1; /* wow! */')).toEqual([]);
  });

  it.each(DIRS)('%s', (dir) => {
    const files = sourceFiles(join(ROOT, dir));
    expect(files.length).toBeGreaterThan(5);
    const found = files.flatMap((file) =>
      findBangs(readFileSync(file, 'utf8')).map((line) => `${relative(ROOT, file)}: ${line}`),
    );
    expect(found).toEqual([]);
  });
});
