/**
 * What the place field needs from a places service. The Google code lives behind this
 * (googlePlaces.ts), so the field is tested with a fake and never calls Google in tests.
 */

export type { PlaceSuggestion, PlaceDetails } from '@griever/shared';
import type { PlaceSuggestion, PlaceDetails } from '@griever/shared';

/** Groups the requests of one typing session. Opaque to callers; each field makes its own. */
export type PlacesToken = object;

export interface PlacesClient {
  /** Starts a session. Fields never share one. Drop it after a pick, or when the field is left. */
  newToken(): PlacesToken;
  /** Suggestions for the typed text, limited to these place types (none listed = any place or address). Rejects on failure. */
  suggest(input: string, types: readonly string[], token: PlacesToken): Promise<PlaceSuggestion[]>;
  /** The name and full address of a suggestion this client returned. Rejects on failure. Ends the session. */
  details(suggestion: PlaceSuggestion): Promise<PlaceDetails>;
}

/** Resolves to a client, or null when suggestions are not available (no key, or Google did not load). Never rejects. */
export type PlacesLoader = () => Promise<PlacesClient | null>;

export { SERVICE_PLACE_TYPES, BURIAL_PLACE_TYPES } from '@griever/shared';
/** Visitation and reception can be at a home, so no filter: any place or street address. An empty list sends no type filter. */
export const ANY_PLACE_TYPES: readonly string[] = [];
