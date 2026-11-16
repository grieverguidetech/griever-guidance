import { pathForSpot, spotFromPath } from './editorLocation';
import type { EditorSpot } from './editorLocation';
import { SECTIONS } from './paths';

const FLOW = '3f2b8c1e-9d4a-4c7e-b1f0-2a6d5e8c9b10';

describe('spotFromPath', () => {
  it('reads a person\'s Overview, section and guide item', () => {
    expect(spotFromPath(`/people/${FLOW}`)).toEqual({ flowId: FLOW, section: 'overview', item: null });
    expect(spotFromPath(`/people/${FLOW}/service`)).toEqual({ flowId: FLOW, section: 'service', item: null });
    expect(spotFromPath(`/people/${FLOW}/guide/set-service`)).toEqual({ flowId: FLOW, section: 'overview', item: 'set-service' });
  });

  it('reads the pages before anyone is saved', () => {
    expect(spotFromPath('/start')).toEqual({ flowId: null, section: 'overview', item: null });
    expect(spotFromPath('/start/obituary')).toEqual({ flowId: null, section: 'obituary', item: null });
    expect(spotFromPath('/start/guide/pronouncement')).toEqual({ flowId: null, section: 'overview', item: 'pronouncement' });
  });

  it.each(['/', '/people', '/account', '/sign-in', '/join', '/sign-up'])('%s is not an editor page', (path) => {
    expect(spotFromPath(path)).toBeNull();
  });

  it.each([
    `/people/${FLOW}/nope`,
    `/people/${FLOW}/guide`,
    `/people/${FLOW}/service/extra`,
    '/people/Margaret%20Hayes',
    `/people/${FLOW}/`,
    '/start/overview',
    '/start/guide',
    '/nope',
  ])('%s is not a path in the table', (path) => {
    expect(spotFromPath(path)).toBeNull();
  });
});

describe('pathForSpot', () => {
  it('builds the person paths', () => {
    expect(pathForSpot({ flowId: FLOW, section: 'overview', item: null })).toBe(`/people/${FLOW}`);
    expect(pathForSpot({ flowId: FLOW, section: 'thanks', item: null })).toBe(`/people/${FLOW}/thanks`);
    expect(pathForSpot({ flowId: FLOW, section: 'overview', item: 'officiant' })).toBe(`/people/${FLOW}/guide/officiant`);
  });

  it('builds the /start paths', () => {
    expect(pathForSpot({ flowId: null, section: 'overview', item: null })).toBe('/start');
    expect(pathForSpot({ flowId: null, section: 'announcement', item: null })).toBe('/start/announcement');
    expect(pathForSpot({ flowId: null, section: 'overview', item: 'custody' })).toBe('/start/guide/custody');
  });

  it('an open item wins over the section', () => {
    expect(pathForSpot({ flowId: FLOW, section: 'service', item: 'officiant' })).toBe(`/people/${FLOW}/guide/officiant`);
    expect(pathForSpot({ flowId: null, section: 'service', item: 'officiant' })).toBe('/start/guide/officiant');
  });

  it('refuses an id the parser would not accept, so a name never reaches the URL', () => {
    expect(() => pathForSpot({ flowId: 'Margaret Hayes', section: 'overview', item: null })).toThrow();
    expect(() => pathForSpot({ flowId: FLOW, section: 'overview', item: '../x' })).toThrow();
  });
});

describe('round trip', () => {
  const spots: EditorSpot[] = [
    ...(['overview', ...SECTIONS] as const).flatMap((section) => [
      { flowId: FLOW, section, item: null },
      { flowId: null, section, item: null },
    ]),
    { flowId: FLOW, section: 'overview', item: 'write-obituary' },
    { flowId: null, section: 'overview', item: 'write-obituary' },
  ];

  it.each(spots)('%o survives path and back', (spot) => {
    expect(spotFromPath(pathForSpot(spot))).toEqual(spot);
  });
});
