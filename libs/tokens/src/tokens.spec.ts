import * as tokens from './index.js';
import { minTouchTarget, spacing } from './index.js';

// The check that the web theme equals these values lives in apps/web/src/tokens.spec.ts, so it
// reruns when styles.css changes. v2 colours are tested in v2.spec.ts.
describe('tokens', () => {
  it('has positive spacing and a 44 pixel touch target', () => {
    expect(Object.values(spacing).every((value) => value > 0)).toBe(true);
    expect(minTouchTarget).toBe(44);
  });

  it('no longer exports the v1 colours, radius or Source Serif names (#1010)', () => {
    for (const name of ['colors', 'radius', 'fonts', 'fontSerifStack']) {
      expect(name in tokens, name).toBe(false);
    }
  });
});
