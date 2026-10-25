import type { Profile, ProfileUpdate } from '@griever/shared';
import { ApiError, apiFetch } from './client.js';

export type ProfileResult =
  | { ok: true; profile: Profile }
  | {
      ok: false;
      /** `no_profile` (404) is normal right after sign-up; `invalid` is a 400 from the gateway. */
      reason: 'signed_out' | 'offline' | 'no_profile' | 'invalid' | 'unavailable' | 'failed';
    };

function profileReason(status: number): Extract<ProfileResult, { ok: false }>['reason'] {
  if (status === 401) {
    return 'signed_out';
  }
  if (status === 404) {
    return 'no_profile';
  }
  if (status === 400) {
    return 'invalid';
  }
  if (status === 503) {
    return 'unavailable';
  }
  return 'failed';
}

async function profileCall(token: string, init?: RequestInit): Promise<ProfileResult> {
  try {
    // The gateway answers with the camelCase `Profile` from libs/shared.
    const profile = await apiFetch<Profile>('/me/profile', {
      ...init,
      headers: { Authorization: `Bearer ${token}` },
    });
    return { ok: true, profile };
  } catch (error) {
    if (error instanceof ApiError) {
      return { ok: false, reason: profileReason(error.status) };
    }
    // Only a fetch TypeError is a network failure; a malformed 200 body (SyntaxError) is `failed`.
    return { ok: false, reason: error instanceof TypeError ? 'offline' : 'failed' };
  }
}

/** Reads the signed-in person's profile with a bearer token from any sign-in provider. */
export function getProfile(token: string): Promise<ProfileResult> {
  return profileCall(token);
}

export function updateProfile(token: string, update: ProfileUpdate): Promise<ProfileResult> {
  return profileCall(token, { method: 'PUT', body: JSON.stringify(update) });
}
