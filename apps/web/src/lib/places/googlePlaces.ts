import type { PlaceDetails, PlaceSuggestion, PlacesClient, PlacesLoader, PlacesToken } from './placesClient';

/** The part of the Maps JavaScript API we use. Typed here so no extra package is needed. */
/** Google's FormattableText. Read it with toString(); every field is guarded. */
interface GoogleText {
  toString(): string;
}
interface GooglePlace {
  displayName?: string | null;
  formattedAddress?: string | null;
  fetchFields(request: { fields: string[] }): Promise<unknown>;
}
interface GooglePrediction {
  placeId: string;
  toPlace(): GooglePlace;
  text?: GoogleText;
  mainText?: GoogleText;
  secondaryText?: GoogleText;
}
interface GooglePlacesLibrary {
  AutocompleteSessionToken: new () => PlacesToken;
  AutocompleteSuggestion: {
    fetchAutocompleteSuggestions(request: {
      input: string;
      includedPrimaryTypes: string[];
      sessionToken: PlacesToken;
      region: string;
      language: string;
    }): Promise<{ suggestions: { placePrediction: GooglePrediction | null }[] }>;
  };
}
interface GoogleMapsGlobal {
  maps?: { importLibrary?: (name: 'places') => Promise<GooglePlacesLibrary> };
}

const MAPS_SCRIPT = 'https://maps.googleapis.com/maps/api/js';
const CALLBACK_NAME = '__griever_maps_ready';
/** A load slower than this counts as failed. */
export const LOAD_TIMEOUT_MS = 8000;

/** The browser key, or '' when the build has none. */
export const googleMapsKey = (): string => String(import.meta.env['VITE_GOOGLE_MAPS_API_KEY'] ?? '').trim();

/**
 * Adds the Maps script with Google's documented `callback` parameter, which runs once the API is ready.
 * Resolves true then, false on a script error or after the timeout. Never rejects.
 */
function loadScript(key: string): Promise<boolean> {
  return new Promise((resolve) => {
    const holder = globalThis as unknown as Record<string, unknown>;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const done = (ok: boolean) => {
      clearTimeout(timer);
      // A no-op, not a delete: Google may still call back after the timeout.
      holder[CALLBACK_NAME] = () => undefined;
      resolve(ok);
    };
    holder[CALLBACK_NAME] = () => done(true);
    timer = setTimeout(() => done(false), LOAD_TIMEOUT_MS);
    const script = document.createElement('script');
    script.src = `${MAPS_SCRIPT}?key=${encodeURIComponent(key)}&loading=async&libraries=places&callback=${CALLBACK_NAME}`;
    script.async = true;
    script.onerror = () => done(false);
    document.head.appendChild(script);
  });
}

const withoutCountry = (line: string) => line.replace(/,\s*USA$/, '');

/** Falls back to the single line when the name or address part is missing. */
function toSuggestion(p: GooglePrediction): PlaceSuggestion | null {
  const text = withoutCountry(p.text?.toString() ?? '');
  if (!text) {
    return null;
  }
  const main = p.mainText?.toString() ?? '';
  const secondary = withoutCountry(p.secondaryText?.toString() ?? '');
  return { id: p.placeId, text, mainText: main || text, secondaryText: secondary };
}

function makeClient(lib: GooglePlacesLibrary): PlacesClient {
  // Which Google prediction each suggestion came from, so details() can ask for its place.
  const predictions = new WeakMap<PlaceSuggestion, GooglePrediction>();
  return {
    newToken: () => new lib.AutocompleteSessionToken(),
    async suggest(input, types, token) {
      const { suggestions } = await lib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input,
        includedPrimaryTypes: [...types],
        sessionToken: token,
        region: 'us',
        language: 'en-US',
      });
      return suggestions.flatMap((s) => {
        const one = s.placePrediction ? toSuggestion(s.placePrediction) : null;
        if (one && s.placePrediction) {
          predictions.set(one, s.placePrediction);
        }
        return one ? [one] : [];
      });
    },
    async details(suggestion): Promise<PlaceDetails> {
      const prediction = predictions.get(suggestion);
      if (!prediction) {
        throw new Error('Unknown suggestion');
      }
      const place = prediction.toPlace();
      await place.fetchFields({ fields: ['displayName', 'formattedAddress'] });
      const address = withoutCountry(place.formattedAddress ?? '');
      if (!address) {
        throw new Error('No address');
      }
      return { name: place.displayName || suggestion.mainText, address };
    },
  };
}

let loading: Promise<PlacesClient | null> | null = null;

/**
 * Loads Google Maps the first time it is called, and only if the build has a key.
 * Nothing is requested from Google until then, so a visitor who never types in a place
 * field never contacts Google. The answer, a failure too, is remembered: one script tag,
 * one promise, and no retry. After a failure the fields stay plain text.
 */
export const loadGooglePlaces: PlacesLoader = () => {
  const key = googleMapsKey();
  if (!key) {
    return Promise.resolve(null);
  }
  loading ??= (async () => {
    try {
      if (!(await loadScript(key))) {
        return null;
      }
      const maps = (globalThis as { google?: GoogleMapsGlobal }).google?.maps;
      if (!maps?.importLibrary) {
        return null;
      }
      return makeClient(await maps.importLibrary('places'));
    } catch {
      return null;
    }
  })();
  return loading;
};
