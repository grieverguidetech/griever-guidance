/**
 * Place search, shared by the gateway (POST /places/suggest and /places/details), the api-client
 * and the web place field, so they cannot drift. Types only plus constants; no Google code here.
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

/** The full details of a picked place. */
export interface PlaceDetails {
  /** The place name. May be empty; callers then use the suggestion's mainText. */
  name: string;
  /** The full street address, with the number and without the country. */
  address: string;
}

export interface PlaceSuggestRequest {
  input: string;
  /** Google place types. Missing or empty means no type filter. */
  types?: string[];
  sessionToken: string;
}

export interface PlaceSuggestResponse {
  suggestions: PlaceSuggestion[];
}

export interface PlaceDetailsRequest {
  placeId: string;
  sessionToken: string;
}

/**
 * Google place types for includedPrimaryTypes. Only Table A types are valid there (a Table B type such
 * as place_of_worship makes the whole request fail):
 * https://developers.google.com/maps/documentation/places/web-service/place-types
 * A request takes at most 5. Service: where a funeral or memorial can be held. Burial: where a person is buried.
 */
export const FUNERAL_HOME_PLACE_TYPES = ['funeral_home'] as const;
export const WORSHIP_PLACE_TYPES = ['church', 'synagogue', 'mosque', 'hindu_temple'] as const;
export const SERVICE_PLACE_TYPES = [...FUNERAL_HOME_PLACE_TYPES, ...WORSHIP_PLACE_TYPES] as const;
export const BURIAL_PLACE_TYPES = ['cemetery'] as const;
/** Every type the gateway accepts. */
export const ALLOWED_PLACE_TYPES: readonly string[] = [...SERVICE_PLACE_TYPES, ...BURIAL_PLACE_TYPES];

/** Shortest typed text worth a lookup. Shorter costs money and gives nothing useful. */
export const PLACE_INPUT_MIN = 3;
export const PLACE_INPUT_MAX = 200;
export const PLACE_TYPES_MAX = 5;
export const PLACE_ID_MAX = 300;
