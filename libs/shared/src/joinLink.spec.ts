import { joinTokenFromUrl } from './joinLink.js';

const TOKEN = 'A'.repeat(20) + 'b'.repeat(20) + '_-9';
const base = 'https://web.grieversguidance.com/join';

describe('joinTokenFromUrl', () => {
  it('reads the token from the fragment', () => {
    expect(joinTokenFromUrl(`${base}#t=${TOKEN}`)).toBe(TOKEN);
  });

  it('reads it when the fragment has other keys', () => {
    expect(joinTokenFromUrl(`${base}#x=1&t=${TOKEN}`)).toBe(TOKEN);
  });

  it('ignores a query string, alone or with a fragment', () => {
    expect(joinTokenFromUrl(`${base}?t=${TOKEN}`)).toBeNull();
    expect(joinTokenFromUrl(`${base}?t=${TOKEN}#t=${TOKEN}`)).toBeNull();
    expect(joinTokenFromUrl(`${base}?x=1#t=${TOKEN}`)).toBeNull();
  });

  it('rejects a token of the wrong shape', () => {
    expect(joinTokenFromUrl(`${base}#t=`)).toBeNull();
    expect(joinTokenFromUrl(`${base}#t=short`)).toBeNull();
    expect(joinTokenFromUrl(`${base}#t=${TOKEN}x`)).toBeNull();
    expect(joinTokenFromUrl(`${base}#t=${TOKEN.slice(1)}!`)).toBeNull();
    expect(joinTokenFromUrl(`${base}#t=${TOKEN}&t=${TOKEN}`)).toBeNull();
    expect(joinTokenFromUrl(`${base}#u=${TOKEN}`)).toBeNull();
    expect(joinTokenFromUrl(base)).toBeNull();
  });

  it('ignores other hosts, ports, schemes and look-alikes', () => {
    expect(joinTokenFromUrl(`https://web.grieversguidance.com.evil.test/join#t=${TOKEN}`)).toBeNull();
    expect(joinTokenFromUrl(`https://evil.test/join#t=${TOKEN}`)).toBeNull();
    expect(joinTokenFromUrl(`https://web.grieversguidance.com:8443/join#t=${TOKEN}`)).toBeNull();
    expect(joinTokenFromUrl(`https://user@web.grieversguidance.com/join#t=${TOKEN}`)).toBeNull();
    expect(joinTokenFromUrl(`https://grieversguidance.com/join#t=${TOKEN}`)).toBeNull();
    expect(joinTokenFromUrl(`http://web.grieversguidance.com/join#t=${TOKEN}`)).toBeNull();
  });

  it('ignores an encoded key and an upper-case host', () => {
    expect(joinTokenFromUrl(`${base}#%74=${TOKEN}`)).toBeNull();
    expect(joinTokenFromUrl(`https://WEB.grieversguidance.com/join#t=${TOKEN}`)).toBeNull();
  });

  it('ignores the custom schemes', () => {
    expect(joinTokenFromUrl(`grieversguidance://join#t=${TOKEN}`)).toBeNull();
    expect(joinTokenFromUrl(`mobile://join#t=${TOKEN}`)).toBeNull();
    expect(joinTokenFromUrl(`exp://192.168.0.2:8081/--/join#t=${TOKEN}`)).toBeNull();
  });

  it('ignores other paths', () => {
    expect(joinTokenFromUrl(`https://web.grieversguidance.com/#t=${TOKEN}`)).toBeNull();
    expect(joinTokenFromUrl(`https://web.grieversguidance.com/join/#t=${TOKEN}`)).toBeNull();
    expect(joinTokenFromUrl(`https://web.grieversguidance.com/joined#t=${TOKEN}`)).toBeNull();
  });
});
