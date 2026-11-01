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

export interface PlacesClient {
  /** Suggestions for the typed text, limited to these place types. Rejects on failure. */
  suggest(input: string, types: readonly string[]): Promise<PlaceSuggestion[]>;
  /** Call after the user picks a suggestion, so the next search starts a new session. */
  endSession(): void;
}

/** Resolves to a client, or null when suggestions are not available (no key, or Google did not load). Never rejects. */
export type PlacesLoader = () => Promise<PlacesClient | null>;

/**
 * Google place types (Places API New, Table A). A request takes at most 5.
 * Service: where a funeral or memorial can be held. Burial: where a person is buried.
 */
export const SERVICE_PLACE_TYPES = ['funeral_home', 'church', 'place_of_worship', 'synagogue', 'mosque'] as const;
export const BURIAL_PLACE_TYPES = ['cemetery'] as const;
