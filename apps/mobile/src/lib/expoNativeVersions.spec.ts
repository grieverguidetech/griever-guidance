import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';

type PackageJson = { version: string; dependencies?: Record<string, string> };

function readPackage(name: string, fromDir: string): { pkg: PackageJson; dir: string } {
  const file = require.resolve(`${name}/package.json`, { paths: [fromDir] });
  return { pkg: JSON.parse(readFileSync(file, 'utf8')), dir: dirname(file) };
}

function parts(version: string): number[] {
  return version.split('.').map((part) => Number(part));
}

/** Only the two range forms expo-modules-core uses: "~1.2.3" and an exact "1.2.3". */
function satisfies(version: string, range: string): boolean {
  if (range.startsWith('~')) {
    const [major, minor, patch] = parts(range.slice(1));
    const [vMajor, vMinor, vPatch] = parts(version);
    return vMajor === major && vMinor === minor && vPatch >= patch;
  }
  if (/^\d+\.\d+\.\d+$/.test(range)) {
    return version === range;
  }
  throw new Error(`Unexpected range "${range}": extend satisfies() before trusting this test`);
}

// The iOS app closed at launch when the root pnpm overrides pinned expo-modules-jsi older than
// expo-modules-core needs: a native link error that unit tests and the Android export cannot see (#947).
describe('Expo native module versions (#947)', () => {
  const expo = readPackage('expo', __dirname);
  const core = readPackage('expo-modules-core', expo.dir);

  for (const name of ['expo-modules-jsi', 'expo-modules-macros']) {
    it(`installs a ${name} that expo-modules-core ${core.pkg.version} accepts`, () => {
      const range = core.pkg.dependencies?.[name];
      expect(range).toBeDefined();
      const installed = readPackage(name, core.dir).pkg.version;
      expect({ name, installed, range, ok: satisfies(installed, range as string) }).toEqual({
        name,
        installed,
        range,
        ok: true,
      });
    });
  }
});
