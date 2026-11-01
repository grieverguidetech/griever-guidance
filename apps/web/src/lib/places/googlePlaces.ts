import type { PlaceSuggestion, PlacesClient, PlacesLoader } from './placesClient';

/** The part of the Maps JavaScript API we use. Typed here so no extra package is needed. */
interface GoogleText {
  text: string;
}
interface GooglePrediction {
  placeId: string;
  text: GoogleText;
  mainText?: GoogleText;
  secondaryText?: GoogleText;
}
interface GooglePlacesLibrary {
  AutocompleteSessionToken: new () => object;
  AutocompleteSuggestion: {
    fetchAutocompleteSuggestions(request: {
      input: string;
      includedPrimaryTypes: string[];
      sessionToken: object;
    }): Promise<{ suggestions: { placePrediction: GooglePrediction | null }[] }>;
  };
}
interface GoogleMapsGlobal {
  maps?: { importLibrary?: (name: 'places') => Promise<GooglePlacesLibrary> };
}

const MAPS_SCRIPT = 'https://maps.googleapis.com/maps/api/js';

/** The browser key, or '' when the build has none. */
export const googleMapsKey = (): string => String(import.meta.env['VITE_GOOGLE_MAPS_API_KEY'] ?? '').trim();

function loadScript(key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `${MAPS_SCRIPT}?key=${encodeURIComponent(key)}&loading=async&libraries=places`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('maps script failed'));
    document.head.appendChild(script);
  });
}

function toSuggestion(p: GooglePrediction): PlaceSuggestion {
  return {
    id: p.placeId,
    text: p.text.text,
    mainText: p.mainText?.text ?? p.text.text,
    secondaryText: p.secondaryText?.text ?? '',
  };
}

function makeClient(lib: GooglePlacesLibrary): PlacesClient {
  let token: object | null = null;
  return {
    async suggest(input, types) {
      token ??= new lib.AutocompleteSessionToken();
      const { suggestions } = await lib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input,
        includedPrimaryTypes: [...types],
        sessionToken: token,
      });
      return suggestions.flatMap((s) => (s.placePrediction ? [toSuggestion(s.placePrediction)] : []));
    },
    endSession() {
      token = null;
    },
  };
}

let loading: Promise<PlacesClient | null> | null = null;

/**
 * Loads Google Maps the first time it is called, and only if the build has a key.
 * Nothing is requested from Google until then, so a visitor who never types in a place
 * field never contacts Google. A failed load is remembered; the field stays plain text.
 */
export const loadGooglePlaces: PlacesLoader = () => {
  const key = googleMapsKey();
  if (!key) {
    return Promise.resolve(null);
  }
  loading ??= (async () => {
    try {
      await loadScript(key);
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
