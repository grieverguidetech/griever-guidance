import { afterEach, beforeEach } from 'vitest';

/** Google's FormattableText: read through toString(). */
const text = (value: string) => ({ toString: () => value });

const scripts = () => document.querySelectorAll('script');
/** Runs the callback named in the script URL, like Google does once the API is ready. */
const googleIsReady = () => {
  const name = new URL((scripts()[0] as HTMLScriptElement).src).searchParams.get('callback') as string;
  (globalThis as unknown as Record<string, () => void>)[name]();
};
const stubLibrary = (fetchAutocompleteSuggestions: unknown) =>
  vi.stubGlobal('google', {
    maps: {
      importLibrary: async () => ({ AutocompleteSessionToken: class {}, AutocompleteSuggestion: { fetchAutocompleteSuggestions } }),
    },
  });

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key');
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  document.head.innerHTML = '';
});

describe('loadGooglePlaces', () => {
  it('with no key: resolves null and adds no script', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', '');
    const { loadGooglePlaces } = await import('./googlePlaces');
    expect(await loadGooglePlaces()).toBeNull();
    expect(scripts()).toHaveLength(0);
  });

  it('uses the callback parameter, and two calls share one script tag and one promise', async () => {
    stubLibrary(vi.fn());
    const { loadGooglePlaces } = await import('./googlePlaces');
    const first = loadGooglePlaces();
    const second = loadGooglePlaces();
    expect(second).toBe(first);
    expect(scripts()).toHaveLength(1);
    expect((scripts()[0] as HTMLScriptElement).src).toContain(
      'https://maps.googleapis.com/maps/api/js?key=test-key&loading=async&libraries=places&callback=',
    );
    googleIsReady();
    expect(await first).not.toBeNull();
    expect(await loadGooglePlaces()).toBe(await first);
    expect(scripts()).toHaveLength(1);
  });

  it('resolves null when the script fails, and adds no second script after the error', async () => {
    const { loadGooglePlaces } = await import('./googlePlaces');
    const pending = loadGooglePlaces();
    (scripts()[0] as HTMLScriptElement).onerror?.(new Event('error'));
    expect(await pending).toBeNull();
    expect(await loadGooglePlaces()).toBeNull();
    expect(scripts()).toHaveLength(1);
  });

  it('resolves null when the script never calls back, after the timeout', async () => {
    vi.useFakeTimers();
    const { loadGooglePlaces, LOAD_TIMEOUT_MS } = await import('./googlePlaces');
    const pending = loadGooglePlaces();
    await vi.advanceTimersByTimeAsync(LOAD_TIMEOUT_MS);
    expect(await pending).toBeNull();
    const late = (globalThis as unknown as Record<string, unknown>).__griever_maps_ready;
    expect(typeof late).toBe('function');
    expect(() => (late as () => void)()).not.toThrow();
    expect(await loadGooglePlaces()).toBeNull();
    expect(scripts()).toHaveLength(1);
  });

  it('resolves null when importLibrary is missing', async () => {
    vi.stubGlobal('google', { maps: {} });
    const { loadGooglePlaces } = await import('./googlePlaces');
    const pending = loadGooglePlaces();
    googleIsReady();
    expect(await pending).toBeNull();
  });

  it('resolves null when importLibrary rejects', async () => {
    vi.stubGlobal('google', { maps: { importLibrary: () => Promise.reject(new Error('no places')) } });
    const { loadGooglePlaces } = await import('./googlePlaces');
    const pending = loadGooglePlaces();
    googleIsReady();
    expect(await pending).toBeNull();
  });
});

describe('the Google client', () => {
  async function ready(fetchAutocompleteSuggestions: unknown) {
    stubLibrary(fetchAutocompleteSuggestions);
    const { loadGooglePlaces } = await import('./googlePlaces');
    const pending = loadGooglePlaces();
    googleIsReady();
    return (await pending)!;
  }

  it('maps predictions, strips a trailing USA, and sends types, region, language and the given token', async () => {
    const fetchAutocompleteSuggestions = vi.fn(async () => ({
      suggestions: [
        {
          placePrediction: {
            placeId: 'p1',
            text: text('Oak, 1 Main St, Springfield, MO, USA'),
            mainText: text('Oak'),
            secondaryText: text('1 Main St, Springfield, MO, USA'),
          },
        },
        { placePrediction: null },
      ],
    }));
    const client = await ready(fetchAutocompleteSuggestions);
    const token = client.newToken();
    expect(client.newToken()).not.toBe(token);
    expect(await client.suggest('oak', ['cemetery'], token)).toEqual([
      { id: 'p1', text: 'Oak, 1 Main St, Springfield, MO', mainText: 'Oak', secondaryText: '1 Main St, Springfield, MO' },
    ]);
    expect(fetchAutocompleteSuggestions).toHaveBeenCalledWith({
      input: 'oak',
      includedPrimaryTypes: ['cemetery'],
      sessionToken: token,
      region: 'us',
      language: 'en-US',
    });
  });

  it('falls back to the whole line when the name and address parts are missing', async () => {
    const client = await ready(async () => ({
      suggestions: [{ placePrediction: { placeId: 'p2', text: text('Oak, 1 Main St') } }, { placePrediction: { placeId: 'p3' } }],
    }));
    expect(await client.suggest('oak', ['cemetery'], client.newToken())).toEqual([
      { id: 'p2', text: 'Oak, 1 Main St', mainText: 'Oak, 1 Main St', secondaryText: '' },
    ]);
  });
});
