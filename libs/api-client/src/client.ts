import type { SendEvent, Template, ObituaryRequest, ObituaryResponse } from '@griever/shared';

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

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${getBaseUrl()}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export interface CreateSendEventPayload {
  userId: string;
  templateId: string;
  contacts: string[];
  fields: Record<string, string>;
}

export function createSendEvent(payload: CreateSendEventPayload): Promise<SendEvent> {
  return apiFetch<SendEvent>('/send', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function getSendHistory(userId: string): Promise<SendEvent[]> {
  return apiFetch<SendEvent[]>(`/history/${encodeURIComponent(userId)}`);
}

export function getTemplates(): Promise<Template[]> {
  return apiFetch<Template[]>('/templates');
}

export function generateObituary(payload: ObituaryRequest): Promise<ObituaryResponse> {
  return apiFetch<ObituaryResponse>('/obituary', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
