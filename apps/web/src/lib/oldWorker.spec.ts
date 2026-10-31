import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const publicDir = resolve(__dirname, '../../public');
const read = (name: string) => readFileSync(resolve(publicDir, name), 'utf8');

describe('old service worker kill switch', () => {
  const sw = read('sw.js');

  it('takes over at once', () => {
    expect(sw).toContain('skipWaiting');
  });

  it('deletes caches, unregisters and reloads open tabs', () => {
    expect(sw).toContain('caches.delete');
    expect(sw).toContain('self.registration.unregister()');
    expect(sw).toContain('client.navigate');
  });

  it('registers nothing and imports nothing', () => {
    expect(sw).not.toMatch(/^\s*import /m);
    expect(sw).not.toContain("addEventListener('fetch'");
  });
});

describe('_headers', () => {
  const headers = read('_headers');
  const block = (path: string) =>
    headers.split(/\n\s*\n/).find((b) => b.split('\n')[0].trim() === path) ?? '';

  it.each(['/sw.js', '/', '/index.html'])('%s is no-cache', (path) => {
    expect(block(path)).toContain('Cache-Control: no-cache');
  });

  it('caches hashed assets for a year', () => {
    expect(block('/assets/*')).toContain('max-age=31536000, immutable');
  });
});
