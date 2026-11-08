import type { PlaceDetails, PlaceDetailsRequest, PlaceSuggestRequest, PlaceSuggestResponse, PlaceSuggestion } from '@griever/shared';
import { ApiError, apiFetch } from './client.js';

/** Why a place call failed. Callers fall back to plain text for every reason, so none needs its own message. */
export type PlacesFailure = 'not_set_up' | 'rate_limited' | 'invalid' | 'too_large' | 'unavailable' | 'offline';

/** Rejected by suggestPlaces and placeDetails. Never carries the typed text. */
export class PlacesError extends Error {
  constructor(
    readonly reason: PlacesFailure,
    readonly status?: number,
  ) {
    super(`Place search failed: ${reason}`);
    this.name = 'PlacesError';
  }
}

function reasonFor(status: number): PlacesFailure {
  if (status === 503) {
    return 'not_set_up';
  }
  if (status === 429) {
    return 'rate_limited';
  }
  if (status === 400) {
    return 'invalid';
  }
  if (status === 413) {
    return 'too_large';
  }
  return 'unavailable';
}

async function placesCall<T>(path: string, body: PlaceSuggestRequest | PlaceDetailsRequest, signal?: AbortSignal): Promise<T> {
  try {
    return await apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body) }, signal);
  } catch (error) {
    if (error instanceof ApiError) {
      throw new PlacesError(reasonFor(error.status), error.status);
    }
    if (error instanceof Error && error.name === 'AbortError') {
      throw error;
    }
    // A fetch TypeError is the network; a malformed 200 body is the service misbehaving.
    throw new PlacesError(error instanceof TypeError ? 'offline' : 'unavailable');
  }
}

/**
 * A session token for one run of typing in one field. The gateway wants 16 to 36 URL-safe characters.
 * Hermes may not have crypto.randomUUID, so there is a fallback; the token only groups billing, it is not a secret.
 */
export function newPlaceSessionToken(): string {
  const cryptoApi = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (typeof cryptoApi?.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }
  let token = '';
  while (token.length < 32) {
    token += Math.floor(Math.random() * 16).toString(16);
  }
  return token;
}

/** Up to 5 suggestions for the typed text. Send at least 3 characters; the gateway refuses fewer. */
export async function suggestPlaces(
  input: string,
  types: readonly string[],
  sessionToken: string,
  signal?: AbortSignal,
): Promise<PlaceSuggestion[]> {
  const body: PlaceSuggestRequest = { input: input.trim(), sessionToken, ...(types.length > 0 ? { types: [...types] } : {}) };
  const result = await placesCall<PlaceSuggestResponse>('/places/suggest', body, signal);
  // A 200 that is not the shape we expect is the service misbehaving, not an empty result.
  if (!Array.isArray(result?.suggestions)) {
    throw new PlacesError('unavailable');
  }
  return result.suggestions;
}

/** The name and street address of a picked suggestion. Ends the billing session for the token. */
export async function placeDetails(placeId: string, sessionToken: string, signal?: AbortSignal): Promise<PlaceDetails> {
  const result = await placesCall<PlaceDetails>('/places/details', { placeId, sessionToken }, signal);
  if (typeof result?.address !== 'string' || typeof result.name !== 'string') {
    throw new PlacesError('unavailable');
  }
  return result;
}
