import type { ObituaryRequest, ObituaryResponse } from '@griever/shared';

declare const __VITE_API_URL__: string | undefined;

function getBaseUrl(): string {
  if (typeof process !== 'undefined' && process.env['EXPO_PUBLIC_API_URL']) {
    return process.env['EXPO_PUBLIC_API_URL'];
  }
  try {
    const viteUrl = (import.meta as { env?: Record<string, string> }).env?.['VITE_API_URL'];
    if (viteUrl) return viteUrl;
  } catch {
    // not in a Vite context
  }
  return 'http://localhost:3001';
}

/** Carries the HTTP status so callers can tell "signed out" (401) from other failures. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  // `...init` goes first so a caller's `headers` can't replace the merged set.
  const res = await fetch(`${getBaseUrl()}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let message = text || res.statusText;
    try {
      const parsed = JSON.parse(text) as { error?: string };
      if (parsed.error) message = parsed.error;
    } catch {
      // body wasn't JSON — fall back to the raw text/status above
    }
    throw new ApiError(message, res.status);
  }
  return res.json() as Promise<T>;
}

export function generateObituary(payload: ObituaryRequest): Promise<ObituaryResponse> {
  return apiFetch<ObituaryResponse>('/obituary', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
