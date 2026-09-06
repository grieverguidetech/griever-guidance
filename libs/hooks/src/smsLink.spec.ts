import { describe, expect, it } from 'vitest';
import { buildSmsLink, isIOSUserAgent, smsHandoffPlausible } from './smsLink.js';

const IOS_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15';
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36';
const DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36';

describe('buildSmsLink', () => {
  it('uses & before body on iOS — tasks/04-sending.md §2', () => {
    expect(buildSmsLink('+16175550148', 'hello', true)).toBe('sms:+16175550148&body=hello');
  });

  it('uses ? before body everywhere else', () => {
    expect(buildSmsLink('+16175550148', 'hello', false)).toBe('sms:+16175550148?body=hello');
  });

  it('never puts more than one recipient in the URI — one phone, one link', () => {
    const link = buildSmsLink('+16175550148', 'hello', false);
    expect(link).toMatch(/^sms:\+16175550148[?&]body=/);
  });

  it('percent-encodes the body so punctuation/newlines survive the URI', () => {
    const link = buildSmsLink('+16175550148', 'Line one\nLine two & more', false);
    expect(link).toBe(
      `sms:+16175550148?body=${encodeURIComponent('Line one\nLine two & more')}`,
    );
  });
});

describe('isIOSUserAgent', () => {
  it('detects iPhone/iPad/iPod UAs', () => {
    expect(isIOSUserAgent(IOS_UA)).toBe(true);
  });

  it('does not flag Android or desktop UAs as iOS', () => {
    expect(isIOSUserAgent(ANDROID_UA)).toBe(false);
    expect(isIOSUserAgent(DESKTOP_UA)).toBe(false);
  });
});

describe('smsHandoffPlausible', () => {
  it('trusts a coarse-pointer (touchscreen) media query over the UA when available', () => {
    const coarse = () => ({ matches: true });
    expect(smsHandoffPlausible(DESKTOP_UA, coarse)).toBe(true);
  });

  it('trusts a fine-pointer (mouse) result even on a phone-like UA', () => {
    const fine = () => ({ matches: false });
    expect(smsHandoffPlausible(IOS_UA, fine)).toBe(false);
  });

  it('falls back to the UA when no matchMedia function is supplied', () => {
    expect(smsHandoffPlausible(IOS_UA)).toBe(true);
    expect(smsHandoffPlausible(ANDROID_UA)).toBe(true);
    expect(smsHandoffPlausible(DESKTOP_UA)).toBe(false);
  });

  it('falls back to the UA when matchMedia throws', () => {
    const throwing = () => {
      throw new Error('matchMedia unsupported');
    };
    expect(smsHandoffPlausible(IOS_UA, throwing)).toBe(true);
    expect(smsHandoffPlausible(DESKTOP_UA, throwing)).toBe(false);
  });
});
