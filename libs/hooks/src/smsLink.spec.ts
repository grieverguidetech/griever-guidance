import { buildSmsLink, isIOSUserAgent } from './smsLink.js';

describe('buildSmsLink (REQUIREMENTS C1: one contact, from the user’s own phone)', () => {
  const message = "Margaret passed away on May 29. We'll share details soon — Peter";

  it('uses ? before body on Android and & on iOS', () => {
    expect(buildSmsLink('+16175550148', 'hi', false)).toBe('sms:+16175550148?body=hi');
    expect(buildSmsLink('+16175550148', 'hi', true)).toBe('sms:+16175550148&body=hi');
  });

  it('addresses exactly one recipient', () => {
    const link = buildSmsLink('+16175550148', message, false);
    expect(link.split('?')[0]).toBe('sms:+16175550148');
    expect(link).not.toContain(',');
  });

  it('encodes the message so it round-trips exactly', () => {
    const link = buildSmsLink('+16175550148', `${message}\n\nhttps://example.com/o?a=1&b=2`, false);
    const body = decodeURIComponent(link.split('body=')[1]);
    expect(body).toBe(`${message}\n\nhttps://example.com/o?a=1&b=2`);
  });
});

describe('isIOSUserAgent', () => {
  it.each([
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', true],
    ['Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)', true],
    ['Mozilla/5.0 (Linux; Android 15; Pixel 9)', false],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0)', false],
  ])('%s -> %s', (ua, expected) => {
    expect(isIOSUserAgent(ua)).toBe(expected);
  });
});
