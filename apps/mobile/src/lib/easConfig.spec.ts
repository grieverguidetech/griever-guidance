import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const eas = JSON.parse(readFileSync(join(__dirname, '../../eas.json'), 'utf8'));

describe('eas.json production submit (#918)', () => {
  it('names the App Store Connect app, so auto-submit does not ask for it', () => {
    expect(eas.submit.production.ios.ascAppId).toMatch(/^\d{9,12}$/);
  });

  it('keeps the Clerk key out of the production profile (it comes from the EAS environment)', () => {
    expect(eas.build.production.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY).toBeUndefined();
  });
});
