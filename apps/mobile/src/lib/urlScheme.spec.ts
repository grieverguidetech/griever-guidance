import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { APP_URL_SCHEME } from './urlScheme';

describe('APP_URL_SCHEME', () => {
  it('matches expo.scheme in app.json', () => {
    const appJson = JSON.parse(readFileSync(join(__dirname, '../../app.json'), 'utf8')) as { expo: { scheme: string } };
    expect(appJson.expo.scheme).toBe('grieversguidance');
    expect(APP_URL_SCHEME).toBe(appJson.expo.scheme);
  });
});
