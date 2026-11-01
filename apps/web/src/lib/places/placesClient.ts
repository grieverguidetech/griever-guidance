/**
 * What the place field needs from a places service. The Google code lives behind this
 * (googlePlaces.ts), so the field is tested with a fake and never calls Google in tests.
 */

export interface PlaceSuggestion {
  /** Stable id from the service, used as the list key. */
  id: string;
  /** The place name and address, as one line. This is what fills the field. */
  text: string;
  /** The place name alone, shown bold in the list. */
  mainText: string;
  /** The address, shown after the name. May be empty. */
  secondaryText: string;
}

/** Groups the requests of one typing session. Opaque to callers; each field makes its own. */
export type PlacesToken = object;

export interface PlacesClient {
  /** Starts a session. Fields never share one. Drop it after a pick, or when the field is left. */
  newToken(): PlacesToken;
  /** Suggestions for the typed text, limited to these place types. Rejects on failure. */
  suggest(input: string, types: readonly string[], token: PlacesToken): Promise<PlaceSuggestion[]>;
}

/** Resolves to a client, or null when suggestions are not available (no key, or Google did not load). Never rejects. */
export type PlacesLoader = () => Promise<PlacesClient | null>;

/**
 * Google place types for includedPrimaryTypes. Only Table A types are valid there (a Table B type such
 * as place_of_worship makes the whole request fail):
 * https://developers.google.com/maps/documentation/places/web-service/place-types
 * A request takes at most 5. Service: where a funeral or memorial can be held. Burial: where a person is buried.
 */
export const SERVICE_PLACE_TYPES = ['funeral_home', 'church', 'synagogue', 'mosque', 'hindu_temple'] as const;
export const BURIAL_PLACE_TYPES = ['cemetery'] as const;
