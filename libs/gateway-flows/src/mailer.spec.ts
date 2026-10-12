import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildInviteLink, cleanOwnerName, inviteEmailContent, sendInviteEmail } from './mailer.js';

const KEY = 're_secret_key_123';
const base = { apiKey: KEY, from: 'Griever Guidance <invites@example.test>', to: 'sam@example.test', link: 'https://web.test/join#t=abc' };

const okFetch = () => vi.fn(async () => new Response('{}', { status: 200 }));

afterEach(() => vi.restoreAllMocks());

describe('buildInviteLink', () => {
  it('puts the token in the fragment, never a query', () => {
    const link = buildInviteLink('https://web.test', 'TOKEN');
    expect(link).toBe('https://web.test/join#t=TOKEN');
    expect(link).not.toContain('?');
  });

  it('does not double the slash', () => {
    expect(buildInviteLink('https://web.test/', 'T')).toBe('https://web.test/join#t=T');
  });
});

describe('cleanOwnerName', () => {
  it('removes URL-shaped text', () => {
    expect(cleanOwnerName('Anna https://evil.test/x www.evil.test')).toBe('Anna');
  });
  it('limits to 100 characters', () => {
    expect(cleanOwnerName('a'.repeat(300))).toHaveLength(100);
  });
  it('falls back to Someone', () => {
    expect(cleanOwnerName('')).toBe('Someone');
    expect(cleanOwnerName(null)).toBe('Someone');
    expect(cleanOwnerName('   https://evil.test  ')).toBe('Someone');
  });
});

describe('inviteEmailContent', () => {
  it('uses the calm wording and the link', () => {
    const c = inviteEmailContent('Anna', 'https://web.test/join#t=abc');
    expect(c.subject).toBe('Anna asked for your help');
    expect(c.text).toBe(
      'Anna asked you to help let people know. This link works for 7 days.\n\nhttps://web.test/join#t=abc\n',
    );
    expect(`${c.subject}${c.text}${c.html}`).not.toContain('!');
  });

  it('escapes the name in the HTML', () => {
    const c = inviteEmailContent('<script>alert(1)</script> & "Co"', 'https://web.test/join#t=abc');
    expect(c.html).not.toContain('<script>');
    expect(c.html).toContain('&lt;script&gt;');
    expect(c.html).toContain('&amp;');
    expect(c.html).toContain('&quot;Co&quot;');
  });
});

describe('sendInviteEmail', () => {
  it('sends one request to Resend with the key, from, one recipient and only the email fields', async () => {
    const fetchImpl = okFetch();
    const result = await sendInviteEmail({ ...base, ownerName: 'Anna' }, fetchImpl as unknown as typeof fetch);
    expect(result).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`);
    const body = JSON.parse(init.body as string);
    expect(Object.keys(body).sort()).toEqual(['from', 'html', 'subject', 'text', 'to']);
    expect(body.from).toBe(base.from);
    expect(body.to).toEqual([base.to]);
    expect(body.text).toContain('Anna asked you to help let people know.');
    expect(init.body).not.toContain(KEY);
  });

  it.each([
    [429, 'rate_limited'],
    [500, 'unavailable'],
    [422, 'rejected'],
    [401, 'rejected'],
  ])('maps status %i to %s without leaking the key', async (status, reason) => {
    const logs = [vi.spyOn(console, 'log'), vi.spyOn(console, 'error'), vi.spyOn(console, 'warn')];
    const fetchImpl = vi.fn(async () => new Response(`bad key ${KEY}`, { status }));
    const result = await sendInviteEmail({ ...base, ownerName: 'Anna' }, fetchImpl as unknown as typeof fetch);
    expect(result).toEqual({ ok: false, reason });
    expect(JSON.stringify(result)).not.toContain(KEY);
    for (const spy of logs) expect(spy).not.toHaveBeenCalled();
  });

  it('maps a network failure to unavailable and does not leak the key', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error(`connect failed with ${KEY}`);
    });
    const result = await sendInviteEmail({ ...base, ownerName: null }, fetchImpl as unknown as typeof fetch);
    expect(result).toEqual({ ok: false, reason: 'unavailable' });
    expect(JSON.stringify(result)).not.toContain(KEY);
  });
});
