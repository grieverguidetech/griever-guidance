import { afterEach, beforeEach } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
  document.head.innerHTML = '';
});

/** Google's FormattableText: read through toString(). */
const text = (value: string) => ({ toString: () => value });

describe('loadGooglePlaces', () => {
  beforeEach(() => vi.resetModules());

  it('with no key: resolves null and adds no script', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', '');
    const { loadGooglePlaces } = await import('./googlePlaces');
    expect(await loadGooglePlaces()).toBeNull();
    expect(document.querySelector('script')).toBeNull();
  });

  it('resolves null, with no error, when the script fails to load', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key');
    const { loadGooglePlaces } = await import('./googlePlaces');
    const pending = loadGooglePlaces();
    const script = document.querySelector('script') as HTMLScriptElement;
    expect(script.src).toContain('https://maps.googleapis.com/maps/api/js?key=test-key&loading=async&libraries=places');
    script.onerror?.(new Event('error'));
    expect(await pending).toBeNull();
  });

  it('falls back to the whole line when the name and address parts are missing', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key');
    vi.stubGlobal('google', {
      maps: {
        importLibrary: async () => ({
          AutocompleteSessionToken: class {},
          AutocompleteSuggestion: {
            fetchAutocompleteSuggestions: async () => ({
              suggestions: [{ placePrediction: { placeId: 'p2', text: text('Oak, 1 Main St') } }, { placePrediction: { placeId: 'p3' } }],
            }),
          },
        }),
      },
    });
    const { loadGooglePlaces } = await import('./googlePlaces');
    const pending = loadGooglePlaces();
    (document.querySelector('script') as HTMLScriptElement).onload?.(new Event('load'));
    const client = await pending;
    expect(await client!.suggest('oak', ['cemetery'])).toEqual([
      { id: 'p2', text: 'Oak, 1 Main St', mainText: 'Oak, 1 Main St', secondaryText: '' },
    ]);
  });

  it('maps predictions, sends the types and one session token until the session ends', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key');
    const tokens: object[] = [];
    const fetchAutocompleteSuggestions = vi.fn(async (req: { sessionToken: object }) => {
      tokens.push(req.sessionToken);
      return {
        suggestions: [
          { placePrediction: { placeId: 'p1', text: text('Oak, 1 Main St'), mainText: text('Oak'), secondaryText: text('1 Main St') } },
          { placePrediction: null },
        ],
      };
    });
    vi.stubGlobal('google', {
      maps: {
        importLibrary: async () => ({
          AutocompleteSessionToken: class {},
          AutocompleteSuggestion: { fetchAutocompleteSuggestions },
        }),
      },
    });
    const { loadGooglePlaces } = await import('./googlePlaces');
    const pending = loadGooglePlaces();
    (document.querySelector('script') as HTMLScriptElement).onload?.(new Event('load'));
    const client = await pending;
    expect(client).not.toBeNull();
    const found = await client!.suggest('oak', ['cemetery']);
    expect(found).toEqual([{ id: 'p1', text: 'Oak, 1 Main St', mainText: 'Oak', secondaryText: '1 Main St' }]);
    expect(fetchAutocompleteSuggestions).toHaveBeenCalledWith(expect.objectContaining({ input: 'oak', includedPrimaryTypes: ['cemetery'], region: 'us', language: 'en-US' }));
    await client!.suggest('oakl', ['cemetery']);
    expect(tokens[1]).toBe(tokens[0]);
    client!.endSession();
    await client!.suggest('oakla', ['cemetery']);
    expect(tokens[2]).not.toBe(tokens[0]);
  });
});
