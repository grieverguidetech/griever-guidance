import { useCallback, useEffect, useMemo, useState } from 'react';
import type { MomentKey, SessionDetails, TemplateCategory } from '@griever/shared';
import { addDays, parseLooseDate } from '@griever/shared';
import type { SendFlowDraft, SendFlowStorage } from './useSendFlow.js';

/** How long a saved contact list outlives the last known service date. */
export const CONTACT_RETENTION_DAYS = 30;

/**
 * The saved contact list (a single pool shared across every session — see
 * `useContacts`) is kept until 30 days after the *latest* service date across
 * all sessions, so it stays available as long as any session is still active.
 * `null` means no session has a service date yet — nothing to expire against,
 * so the list is kept indefinitely until one is set.
 */
export function getContactsRetentionExpiry(sessions: Session[]): Date | null {
  const dates = sessions
    .map((s) => parseLooseDate(s.serviceDate))
    .filter((d): d is Date => d !== null);
  if (dates.length === 0) return null;
  const latest = new Date(Math.max(...dates.map((d) => d.getTime())));
  return addDays(latest, CONTACT_RETENTION_DAYS);
}

export interface ReminderEntry {
  momentKey: MomentKey;
  dueAt: string;
  dismissed: boolean;
}

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
  /** Set by the C2 gate's "Yes, we've set a date" choice. */
  serviceReady: boolean;
  /**
   * Contact IDs already messaged per moment — the source of both "done" status
   * and C5's dedup ("nobody gets this twice"). Lives only here, client-local,
   * never sent to the API: contact identities are never persisted to the DB.
   */
  recipientsNotified: Partial<Record<TemplateCategory, string[]>>;
  momentCompletedAt: Partial<Record<MomentKey, string>>;
  remindersScheduled: ReminderEntry[];
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
  setServiceReady: (id: string, ready: boolean) => void;
  scheduleReminder: (id: string, momentKey: MomentKey, dueAt: string) => void;
  /** Marks a moment done and records who was notified, for dedup. */
  recordMomentComplete: (id: string, category: TemplateCategory, contactIds: string[]) => void;
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

const MOMENT_KEY_BY_CATEGORY: Partial<Record<TemplateCategory, MomentKey>> = {
  announcement: 'announce',
  service: 'service',
  obituary: 'obituary',
  aftercare: 'thanks',
};

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
      serviceReady: false,
      recipientsNotified: {},
      momentCompletedAt: {},
      remindersScheduled: [],
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

  const setServiceReady = useCallback((id: string, ready: boolean) => {
    setSessions((list) =>
      list.map((s) => (s.id === id ? { ...s, serviceReady: ready } : s)),
    );
  }, []);

  const scheduleReminder = useCallback(
    (id: string, momentKey: MomentKey, dueAt: string) => {
      setSessions((list) =>
        list.map((s) =>
          s.id === id
            ? {
                ...s,
                remindersScheduled: [
                  ...s.remindersScheduled.filter((r) => r.momentKey !== momentKey),
                  { momentKey, dueAt, dismissed: false },
                ],
              }
            : s,
        ),
      );
    },
    [],
  );

  const recordMomentComplete = useCallback(
    (id: string, category: TemplateCategory, contactIds: string[]) => {
      setSessions((list) =>
        list.map((s) => {
          if (s.id !== id) return s;
          const momentKey = MOMENT_KEY_BY_CATEGORY[category];
          if (!momentKey) return s;
          const already = s.recipientsNotified[category] ?? [];
          const notified = Array.from(new Set([...already, ...contactIds]));
          return {
            ...s,
            recipientsNotified: { ...s.recipientsNotified, [category]: notified },
            momentCompletedAt: {
              ...s.momentCompletedAt,
              [momentKey]: s.momentCompletedAt[momentKey] ?? new Date().toISOString(),
            },
          };
        }),
      );
    },
    [],
  );

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
    setServiceReady,
    scheduleReminder,
    recordMomentComplete,
  };
}
