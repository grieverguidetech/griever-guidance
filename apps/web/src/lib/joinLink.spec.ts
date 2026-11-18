import {
  JOIN_MAX_AGE_MS,
  JOIN_STORAGE_KEY,
  captureJoinLink,
  clearJoinToken,
  joinOutcome,
  joinTokenFromUrl,
  savedJoinToken,
} from './joinLink';

const TOKEN = 'A'.repeat(42) + '-';
const OTHER = 'b_'.repeat(21) + '9';
const NOW = 1_800_000_000_000;

function open(path: string) {
  window.history.replaceState(null, '', path);
}

beforeEach(() => {
  clearJoinToken();
  window.localStorage.clear();
  open('/');
});

describe('joinTokenFromUrl', () => {
  it('reads the token from the fragment of /join', () => {
    expect(joinTokenFromUrl(`https://web.example.com/join#t=${TOKEN}`)).toBe(TOKEN);
  });

  it('ignores a token in the query string', () => {
    expect(joinTokenFromUrl(`https://web.example.com/join?t=${TOKEN}`)).toBeNull();
  });

  it.each([
    ['another path', `https://web.example.com/#t=${TOKEN}`],
    ['a path under /join', `https://web.example.com/join/x#t=${TOKEN}`],
    ['too short', `https://web.example.com/join#t=${TOKEN.slice(1)}`],
    ['too long', `https://web.example.com/join#t=${TOKEN}A`],
    ['a character outside base64url', `https://web.example.com/join#t=${TOKEN.slice(1)}+`],
    ['an encoded character', `https://web.example.com/join#t=${TOKEN.slice(1)}%2F`],
    ['no t', `https://web.example.com/join#x=${TOKEN}`],
    ['not a URL', 'join'],
  ])('rejects %s', (_label, href) => {
    expect(joinTokenFromUrl(href)).toBeNull();
  });
});

describe('captureJoinLink', () => {
  it('keeps a fragment token in memory and storage, and clears the address bar', () => {
    window.history.replaceState({ idx: 0 }, '', `/join#t=${TOKEN}`);
    captureJoinLink(NOW);
    expect(window.location.pathname).toBe('/join');
    expect(window.location.hash).toBe('');
    expect(window.location.href).not.toContain(TOKEN);
    expect(window.history.state).toEqual({ idx: 0 });
    expect(JSON.parse(window.localStorage.getItem(JOIN_STORAGE_KEY) ?? '')).toEqual({ token: TOKEN, savedAt: NOW });
    expect(savedJoinToken(NOW)).toBe(TOKEN);
  });

  it('does not save a query-string token, but still takes it out of the address bar', () => {
    open(`/join?t=${TOKEN}`);
    captureJoinLink(NOW);
    expect(savedJoinToken(NOW)).toBeNull();
    expect(window.localStorage.getItem(JOIN_STORAGE_KEY)).toBeNull();
    expect(window.location.search).toBe('');
  });

  it('does nothing on another path', () => {
    open(`/people#t=${TOKEN}`);
    captureJoinLink(NOW);
    expect(savedJoinToken(NOW)).toBeNull();
    expect(window.location.hash).toBe(`#t=${TOKEN}`);
  });

  it('is safe to call again: the second call keeps the token', () => {
    open(`/join#t=${TOKEN}`);
    captureJoinLink(NOW);
    captureJoinLink(NOW);
    expect(savedJoinToken(NOW)).toBe(TOKEN);
  });

  it('a newer link replaces an older saved one', () => {
    window.localStorage.setItem(JOIN_STORAGE_KEY, JSON.stringify({ token: OTHER, savedAt: NOW }));
    open(`/join#t=${TOKEN}`);
    captureJoinLink(NOW);
    expect(savedJoinToken(NOW)).toBe(TOKEN);
  });
});

describe('savedJoinToken', () => {
  it('reads a token saved on an earlier load (the email-confirmation round trip)', () => {
    window.localStorage.setItem(JOIN_STORAGE_KEY, JSON.stringify({ token: TOKEN, savedAt: NOW }));
    expect(savedJoinToken(NOW + JOIN_MAX_AGE_MS - 1)).toBe(TOKEN);
  });

  it('drops a token after 7 days', () => {
    window.localStorage.setItem(JOIN_STORAGE_KEY, JSON.stringify({ token: TOKEN, savedAt: NOW }));
    expect(savedJoinToken(NOW + JOIN_MAX_AGE_MS)).toBeNull();
    expect(window.localStorage.getItem(JOIN_STORAGE_KEY)).toBeNull();
  });

  it.each([
    ['not JSON', 'nope'],
    ['a bad token', JSON.stringify({ token: 'short', savedAt: NOW })],
    ['no date', JSON.stringify({ token: TOKEN })],
    ['a date that is not a number', JSON.stringify({ token: TOKEN, savedAt: String(NOW) })],
    ['a token that is not a string', JSON.stringify({ token: 42, savedAt: NOW })],
    ['a date in the future', JSON.stringify({ token: TOKEN, savedAt: NOW + 1000 })],
  ])('drops an entry with %s', (_label, raw) => {
    window.localStorage.setItem(JOIN_STORAGE_KEY, raw);
    expect(savedJoinToken(NOW)).toBeNull();
    expect(window.localStorage.getItem(JOIN_STORAGE_KEY)).toBeNull();
  });
});

describe('clearJoinToken', () => {
  it('uses the token up: memory and storage are both empty afterwards', () => {
    open(`/join#t=${TOKEN}`);
    captureJoinLink(NOW);
    clearJoinToken();
    expect(savedJoinToken(NOW)).toBeNull();
    expect(window.localStorage.getItem(JOIN_STORAGE_KEY)).toBeNull();
  });
});

describe('joinOutcome', () => {
  it('joined on success', () => {
    expect(joinOutcome({ ok: true, ownerId: 'o1' })).toBe('joined');
  });

  it.each(['unusable', 'invalid', 'forbidden'] as const)('%s is a dead link: the link is used up', (reason) => {
    expect(joinOutcome({ ok: false, reason })).toBe('unusable');
  });

  it('conflict is its own outcome', () => {
    expect(joinOutcome({ ok: false, reason: 'conflict' })).toBe('conflict');
  });

  it('offline, or no answer in time, keeps the link', () => {
    expect(joinOutcome({ ok: false, reason: 'offline' })).toBe('offline');
    expect(joinOutcome(null)).toBe('offline');
  });

  it.each(['unavailable', 'rate_limited', 'signed_out', 'failed'] as const)('%s keeps the link for later', (reason) => {
    expect(joinOutcome({ ok: false, reason })).toBe('later');
  });
});
