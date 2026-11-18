import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type IntentFilter = {
  action?: string;
  autoVerify?: boolean;
  data?: { scheme?: string; host?: string; path?: string }[];
  category?: string[];
};

const config = JSON.parse(readFileSync(join(__dirname, '../../app.json'), 'utf8')).expo;

describe('app links for invite links (#231)', () => {
  it('sets the bundle id and package', () => {
    expect(config.ios.bundleIdentifier).toBe('com.grieversguidance.app');
    expect(config.android.package).toBe('com.grieversguidance.app');
  });

  it('declares the iOS associated domain', () => {
    expect(config.ios.associatedDomains).toContain('applinks:web.grieversguidance.com');
  });

  it('declares a verified Android intent filter for https web.grieversguidance.com/join', () => {
    const filters: IntentFilter[] = config.android.intentFilters ?? [];
    const match = filters.find((filter) => {
      return filter.data?.some((d) => d.host === 'web.grieversguidance.com') === true;
    });
    expect(match).toBeDefined();
    expect(match?.action).toBe('VIEW');
    expect(match?.autoVerify).toBe(true);
    expect(match?.data).toEqual([{ scheme: 'https', host: 'web.grieversguidance.com', path: '/join' }]);
    expect(match?.category).toEqual(expect.arrayContaining(['BROWSABLE', 'DEFAULT']));
  });
});
