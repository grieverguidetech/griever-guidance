import type { ObituaryRequest, ObituaryResponse } from '@griever/shared';

const DEFAULT_BASE_URL = 'http://localhost:3001';

let configuredBaseUrl: string | undefined;

/**
 * Sets the gateway URL. Each app calls this once at startup with its own env var. This lib must not
 * read `import.meta` (Hermes can't parse it), so the bundler-specific read lives in the app.
 * An empty or missing value leaves the fallbacks in place.
 */
export function configureApiClient(options: { baseUrl?: string | undefined }): void {
  configuredBaseUrl = options.baseUrl?.trim() || undefined;
}

function getBaseUrl(): string {
  if (configuredBaseUrl) return configuredBaseUrl;
  // Only works in Node/Vitest. Hermes' runtime process.env doesn't carry EXPO_PUBLIC_* (Metro inlines
  // it at the call site), so apps must call configureApiClient.
  if (typeof process !== 'undefined' && process.env['EXPO_PUBLIC_API_URL']) {
    return process.env['EXPO_PUBLIC_API_URL'];
  }
  return DEFAULT_BASE_URL;
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
