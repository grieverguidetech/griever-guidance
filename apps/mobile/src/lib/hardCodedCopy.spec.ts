import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { findHardCodedCopy } from '@griever/copy';
import type { ScreenName } from '@griever/copy';

/**
 * A screen listed here takes its words from libs/copy, so its source must not hold any of them as a
 * literal. Add a screen in the same PR that migrates it. `file` is relative to apps/mobile/src.
 */
const MIGRATED_SCREENS: { copy: ScreenName; file: string }[] = [];

describe('migrated screens do not hard-code copy', () => {
  // A loop, not it.each: the list is empty until the first screen is migrated.
  for (const entry of MIGRATED_SCREENS) {
    it(entry.file, () => {
      const source = readFileSync(join(__dirname, '..', entry.file), 'utf8');
      expect(findHardCodedCopy(source, entry.copy)).toEqual([]);
    });
  }

  it('uses the shared matcher (see libs/copy for its own tests)', () => {
    expect(findHardCodedCopy("const t = 'One thing at a time.';", 'pathLanding')).toHaveLength(1);
  });
});
