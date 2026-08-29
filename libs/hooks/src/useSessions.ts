import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SessionDetails } from '@griever/shared';
import type { SendFlowDraft, SendFlowStorage } from './useSendFlow.js';

/**
 * A session is keyed to one person the griever has lost. Their details are
 * captured once and every message flow reads from here. Sessions are durable
 * (restored on reload) and there can be more than one.
 */
export interface Session extends SessionDetails {
  id: string;
  createdAt: string;
  lastOpenedAt: string;
  /** Persisted wizard state; `null` once nothing is in progress. */
  draft: SendFlowDraft | null;
}

export interface UseSessionsResult {
  sessions: Session[];
  inProgressSessions: Session[];
  createSession: (details?: Partial<SessionDetails>) => Session;
  updateSession: (id: string, patch: Partial<SessionDetails>) => void;
  updateDraft: (id: string, draft: SendFlowDraft) => void;
  touchSession: (id: string) => void;
  deleteSession: (id: string) => void;
  pruneEmpty: () => void;
}

const STORAGE_KEY = 'gg.sessions.v1';

function load(storage: SendFlowStorage | undefined): Session[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Session[]) : [];
  } catch {
    return [];
  }
}

function save(storage: SendFlowStorage | undefined, sessions: Session[]): void {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch {
    // storage unavailable — sessions still work for this tab's lifetime
  }
}

function newId(): string {
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function useSessions(storage?: SendFlowStorage): UseSessionsResult {
  const [sessions, setSessions] = useState<Session[]>(() => load(storage));

  useEffect(() => {
    save(storage, sessions);
  }, [storage, sessions]);

  const createSession = useCallback((details?: Partial<SessionDetails>) => {
    const now = new Date().toISOString();
    const session: Session = {
      id: newId(),
      personName: '',
      dateOfPassing: '',
      senderName: '',
      obituaryUrl: '',
      ...details,
      createdAt: now,
      lastOpenedAt: now,
      draft: null,
    };
    setSessions((list) => [session, ...list]);
    return session;
  }, []);

  const updateSession = useCallback((id: string, patch: Partial<SessionDetails>) => {
    setSessions((list) =>
      list.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    );
  }, []);

  const updateDraft = useCallback((id: string, draft: SendFlowDraft) => {
    setSessions((list) =>
      list.map((s) => {
        if (s.id !== id) return s;
        if (s.draft && JSON.stringify(s.draft) === JSON.stringify(draft)) return s;
        return { ...s, draft };
      }),
    );
  }, []);

  const touchSession = useCallback((id: string) => {
    setSessions((list) =>
      list.map((s) =>
        s.id === id ? { ...s, lastOpenedAt: new Date().toISOString() } : s,
      ),
    );
  }, []);

  const deleteSession = useCallback((id: string) => {
    setSessions((list) => list.filter((s) => s.id !== id));
  }, []);

  const pruneEmpty = useCallback(() => {
    setSessions((list) =>
      list.filter((s) => s.personName.trim() !== '' || s.draft !== null),
    );
  }, []);

  const inProgressSessions = useMemo(
    () =>
      sessions
        .filter(
          (s) =>
            (s.personName.trim() !== '' || s.draft !== null) &&
            !(s.draft !== null && s.draft.step === 'sent'),
        )
        .sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt)),
    [sessions],
  );

  return {
    sessions,
    inProgressSessions,
    createSession,
    updateSession,
    updateDraft,
    touchSession,
    deleteSession,
    pruneEmpty,
  };
}
