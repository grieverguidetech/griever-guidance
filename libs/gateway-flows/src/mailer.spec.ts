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

  it.each(['http://web.test', 'https://web.test/?a=1', 'https://web.test/#x', 'not a url'])(
    'throws for %s',
    (webUrl) => {
      expect(() => buildInviteLink(webUrl, 'T')).toThrow();
    },
  );
});

describe('cleanOwnerName', () => {
  it.each([
    ['Anna https://evil.test/x www.evil.test', 'Anna'],
    ['anna.com', ''],
    ['Anna visit evil.com/login', 'Anna visit'],
    ['Anna Lee', 'Anna Lee'],
    ['\u202eevil', 'evil'],
    ['An\u200bna', 'Anna'],
    ['Anna\u2028Lee\u0085', 'AnnaLee'],
    ['Anna\nLee', 'Anna Lee'],
  ])('cleans %j', (raw, expected) => {
    expect(cleanOwnerName(raw)).toBe(expected);
  });

  it('limits to 100 characters', () => {
    expect(cleanOwnerName('a'.repeat(300))).toHaveLength(100);
  });

  it('is empty for nothing usable', () => {
    expect(cleanOwnerName('')).toBe('');
    expect(cleanOwnerName(null)).toBe('');
  });
});

describe('inviteEmailContent', () => {
  const link = 'https://web.test/join#t=abc';

  it('with a name', () => {
    expect(inviteEmailContent('Anna', link)).toEqual({
      subject: 'Anna asked for your help',
      text: `Anna asked you to help let people know. This link works for 7 days.\n\n${link}\n`,
    });
  });

  it.each([null, '', 'https://evil.test'])('without a usable name (%j)', (name) => {
    const c = inviteEmailContent(name, link);
    expect(c).toEqual({
      subject: "You've been asked to help",
      text: `You've been asked to help let people know. This link works for 7 days.\n\n${link}\n`,
    });
    expect(`${c.subject}${c.text}`).not.toContain('!');
  });
});

describe('sendInviteEmail', () => {
  it('sends one request to Resend with the key and exactly from/to/subject/text', async () => {
    const fetchImpl = okFetch();
    const result = await sendInviteEmail({ ...base, ownerName: 'Anna' }, fetchImpl as unknown as typeof fetch);
    expect(result).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`);
    const body = JSON.parse(init.body as string);
    expect(Object.keys(body).sort()).toEqual(['from', 'subject', 'text', 'to']);
    expect(body.from).toBe(base.from);
    expect(body.to).toEqual([base.to]);
    expect(body.text).toContain('Anna asked you to help let people know.');
    expect(init.body).not.toContain(KEY);
  });

  it('rejects a bad recipient without calling fetch', async () => {
    const fetchImpl = okFetch();
    const result = await sendInviteEmail(
      { ...base, to: 'a@b.co, evil@x.test', ownerName: 'Anna' },
      fetchImpl as unknown as typeof fetch,
    );
    expect(result).toEqual({ ok: false, reason: 'rejected' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    [429, 'rate_limited'],
    [400, 'rejected'],
    [422, 'rejected'],
    [401, 'unavailable'],
    [403, 'unavailable'],
    [404, 'unavailable'],
    [500, 'unavailable'],
    [503, 'unavailable'],
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
