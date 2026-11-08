import {
  ALLOWED_PLACE_TYPES,
  PLACE_ID_MAX,
  PLACE_INPUT_MAX,
  PLACE_INPUT_MIN,
  PLACE_TYPES_MAX,
  type PlaceDetailsRequest,
  type PlaceSuggestRequest,
} from '@griever/shared';

const SESSION_TOKEN = /^[A-Za-z0-9_-]{16,36}$/;
// The id goes into Google's URL path, so only URL-safe characters are allowed.
const PLACE_ID = new RegExp(`^[A-Za-z0-9_-]{1,${PLACE_ID_MAX}}$`);

function isPlainObject(body: unknown): body is Record<string, unknown> {
  return typeof body === 'object' && body !== null && !Array.isArray(body);
}

function onlyKeys(body: Record<string, unknown>, allowed: string[]): boolean {
  return Object.keys(body).every((key) => allowed.includes(key));
}

function validTypes(value: unknown): value is string[] {
  if (!Array.isArray(value) || value.length > PLACE_TYPES_MAX) {
    return false;
  }
  if (!value.every((t) => typeof t === 'string' && ALLOWED_PLACE_TYPES.includes(t))) {
    return false;
  }
  return new Set(value).size === value.length;
}

/** Returns the clean request (input trimmed), or null when the body is not acceptable. */
export function parseSuggestBody(body: unknown): PlaceSuggestRequest | null {
  if (!isPlainObject(body) || !onlyKeys(body, ['input', 'types', 'sessionToken'])) {
    return null;
  }
  const { input, types, sessionToken } = body;
  if (typeof input !== 'string' || typeof sessionToken !== 'string' || !SESSION_TOKEN.test(sessionToken)) {
    return null;
  }
  const trimmed = input.trim();
  if (trimmed.length < PLACE_INPUT_MIN || trimmed.length > PLACE_INPUT_MAX) {
    return null;
  }
  if (types !== undefined && !validTypes(types)) {
    return null;
  }
  return { input: trimmed, types: types ?? [], sessionToken };
}

export function parseDetailsBody(body: unknown): PlaceDetailsRequest | null {
  if (!isPlainObject(body) || !onlyKeys(body, ['placeId', 'sessionToken'])) {
    return null;
  }
  const { placeId, sessionToken } = body;
  if (typeof placeId !== 'string' || !PLACE_ID.test(placeId)) {
    return null;
  }
  if (typeof sessionToken !== 'string' || !SESSION_TOKEN.test(sessionToken)) {
    return null;
  }
  return { placeId, sessionToken };
}
