import type { PlaceDetails, PlaceSuggestion } from '@griever/shared';

const BASE = 'https://places.googleapis.com/v1';
const TIMEOUT_MS = 5000;
const MAX_SUGGESTIONS = 5;

// Fixed field masks: the gateway never asks Google for more than this (no lat/lng, photos, etc.).
export const SUGGEST_FIELD_MASK =
  'suggestions.placePrediction.placeId,suggestions.placePrediction.text.text,suggestions.placePrediction.structuredFormat';
export const DETAILS_FIELD_MASK = 'displayName,formattedAddress';

/** Any failure talking to Google. Carries no request content, so it is safe to handle anywhere. */
export class PlacesUpstreamError extends Error {}

const withoutCountry = (line: string) => line.replace(/,\s*USA$/, '');

async function callGoogle(url: string, init: RequestInit, key: string, fieldMask: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': fieldMask,
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new PlacesUpstreamError('request failed');
  }
  if (!res.ok) {
    throw new PlacesUpstreamError(`status ${res.status}`);
  }
  try {
    return await res.json();
  } catch {
    throw new PlacesUpstreamError('bad json');
  }
}

interface RawPrediction {
  placePrediction?: {
    placeId?: unknown;
    text?: { text?: unknown };
    structuredFormat?: { mainText?: { text?: unknown }; secondaryText?: { text?: unknown } };
  };
}

const str = (value: unknown): string => (typeof value === 'string' ? value : '');

function toSuggestion(item: RawPrediction): PlaceSuggestion | null {
  const p = item?.placePrediction;
  const id = str(p?.placeId);
  const text = withoutCountry(str(p?.text?.text));
  if (!id || !text) {
    return null;
  }
  const main = str(p?.structuredFormat?.mainText?.text);
  const secondary = withoutCountry(str(p?.structuredFormat?.secondaryText?.text));
  return { id, text, mainText: main || text, secondaryText: secondary };
}

export async function googleSuggest(
  input: string,
  types: readonly string[],
  sessionToken: string,
  key: string,
): Promise<PlaceSuggestion[]> {
  const body: Record<string, unknown> = { input, sessionToken, regionCode: 'us', languageCode: 'en-US' };
  if (types.length > 0) {
    body['includedPrimaryTypes'] = types;
  }
  const json = (await callGoogle(
    `${BASE}/places:autocomplete`,
    { method: 'POST', body: JSON.stringify(body) },
    key,
    SUGGEST_FIELD_MASK,
  )) as { suggestions?: unknown } | null;
  const items = Array.isArray(json?.suggestions) ? (json.suggestions as RawPrediction[]) : [];
  // Query predictions have no placePrediction and are dropped.
  return items
    .map(toSuggestion)
    .filter((s): s is PlaceSuggestion => s !== null)
    .slice(0, MAX_SUGGESTIONS);
}

export async function googleDetails(placeId: string, sessionToken: string, key: string): Promise<PlaceDetails> {
  const query = new URLSearchParams({ sessionToken, languageCode: 'en-US', regionCode: 'us' });
  const json = (await callGoogle(
    `${BASE}/places/${placeId}?${query.toString()}`,
    { method: 'GET' },
    key,
    DETAILS_FIELD_MASK,
  )) as { displayName?: { text?: unknown }; formattedAddress?: unknown } | null;
  const address = withoutCountry(str(json?.formattedAddress));
  if (!address) {
    throw new PlacesUpstreamError('no address');
  }
  return { name: str(json?.displayName?.text), address };
}
