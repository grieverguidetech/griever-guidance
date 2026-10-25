import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fill, prototypePathLandingCopy } from './index';

// PROTOTYPE #322: a tiny shape check standing in for a real JSON Schema validator (none installed).
const schema = JSON.parse(readFileSync(new URL('../screens/pathLanding.schema.json', import.meta.url), 'utf8')) as {
  required: string[];
};

describe('PROTOTYPE pathLanding copy', () => {
  it('has every key the schema requires', () => {
    for (const key of schema.required) {
      expect(prototypePathLandingCopy).toHaveProperty(key);
    }
  });
  it('fills {name}', () => {
    expect(fill(prototypePathLandingCopy.forName, { name: 'Margaret' })).toBe('For Margaret');
  });
});
