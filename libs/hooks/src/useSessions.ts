import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  FlowFactKey,
  FlowRecord,
  FlowRole,
  MomentKey,
  SessionDetails,
  TemplateCategory,
} from '@griever/shared';
import {
  addDays,
  flowFactsToSessionFields,
  FLOW_FACT_KEYS,
  mergeFlowFacts,
  parseCompleteDate,
  toFlowFacts,
} from '@griever/shared';
import { freshDraft, hasDraftInProgress } from './useSendFlow.js';
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
    .map((s) => parseCompleteDate(s.serviceDate))
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
  /** The local key. It never changes and is not what the server knows the person by. */
  id: string;
  /** UUID v4 made on this device; the person's id on the server. Stable once set. */
  flowId: string;
  /** The account that owns this person. null = made on this device, not yet tied to an account. */
  ownerId: string | null;
  /** 'member' = someone shared this person with me. Only ever changed by `applyRemoteFlows`. */
  role: FlowRole;
  createdAt: string;
  lastOpenedAt: string;
  /**
   * Persisted wizard state, one draft per moment, so starting one moment never overwrites
   * another that is half done. Only drafts with a chosen moment are kept.
   */
  drafts: Partial<Record<TemplateCategory, SendFlowDraft>>;
  /** When each draft last changed, so the most recent one reopens. */
  draftsUpdatedAt?: Partial<Record<TemplateCategory, string>>;
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
  /** Empties one moment's draft. Other moments, people, contacts and who was notified stay as they are. */
  clearDraft: (id: string, category: TemplateCategory) => void;
  touchSession: (id: string) => void;
  deleteSession: (id: string) => void;
  /**
   * Takes one person off this device, with their drafts, reminders and who was notified. Local only:
   * nothing is sent, and other sessions are unchanged. Returns false and removes nothing when the
   * session is unknown or is a 'member' session (a shared person is never removed by a member, C9, C11).
   * Sync notices the missing session and drops that person's queued edits (see `useFlowSync`).
   */
  removeSession: (id: string) => boolean;
  pruneEmpty: () => void;
  setServiceReady: (id: string, ready: boolean) => void;
  scheduleReminder: (id: string, momentKey: MomentKey, dueAt: string) => void;
  /** Marks a moment done and records who was notified, for dedup. */
  recordMomentComplete: (id: string, category: TemplateCategory, contactIds: string[]) => void;
  /**
   * Applies what the server returned for this account. `pendingByFlow` maps a flowId to the fact
   * fields with an unsent local edit; those keep the local value. A flow not on the device becomes
   * a 'member' session. A 'member' session whose flow is no longer returned is removed (access was
   * lost). 'owner' sessions are never removed. Drafts, contacts, who was notified, reminders and
   * edited wording are never touched. With no signed-in user (`myUserId` empty) nothing changes.
   * When `dropped > 0` some records could not be read, so nothing is removed (they may be among
   * the missing). A role comes from ownership: `record.ownerId === myUserId`. A session with
   * `ownerId === null` is never turned into a member.
   */
  applyRemoteFlows: (
    result: { flows: readonly FlowRecord[]; dropped?: number },
    myUserId: string,
    pendingByFlow?: Readonly<Record<string, Iterable<FlowFactKey>>>,
  ) => void;
}

/** Sessions with a person's name, most recently opened first. The first is the one that reopens. */
export function namedSessionsByRecent(sessions: Session[]): Session[] {
  return sessions
    .filter((s) => s.personName.trim() !== '')
    .sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt));
}

/** The saved shape before drafts were kept per moment: one `draft` slot. */
type StoredSession = Omit<Session, 'drafts' | 'flowId' | 'ownerId' | 'role'> & {
  flowId?: string;
  ownerId?: string | null;
  role?: FlowRole;
  draft?: SendFlowDraft | null;
  drafts?: Session['drafts'];
};

const STORAGE_KEY = 'gg.sessions.v1';

/**
 * The draft that reopens: the in-progress one (never 'sending' or 'sent') that changed most
 * recently, or null when nothing is under way.
 */
export function latestInProgressDraft(session: Pick<Session, 'drafts' | 'draftsUpdatedAt'>): SendFlowDraft | null {
  const stamp = (category: string) => session.draftsUpdatedAt?.[category as TemplateCategory] ?? '';
  const [latest] = (Object.keys(session.drafts) as TemplateCategory[])
    .filter((category) => hasDraftInProgress(session.drafts[category]))
    .sort((a, b) => stamp(b).localeCompare(stamp(a)));
  return latest ? (session.drafts[latest] ?? null) : null;
}

/**
 * C2: message content is not kept after a send. A draft at 'sent' keeps only the moment
 * (category) and who was messaged; the typed fields, the hand-edited wording, the place and
 * everything else that composes the text are dropped. Other drafts are returned unchanged.
 * The live flow keeps its full state in memory, so the Sent screen is unaffected.
 */
export function stripSentWording(draft: SendFlowDraft): SendFlowDraft;
export function stripSentWording(draft: SendFlowDraft | null): SendFlowDraft | null;
export function stripSentWording(draft: SendFlowDraft | null): SendFlowDraft | null {
  if (!draft || draft.step !== 'sent') return draft;
  return freshDraft({
    step: 'sent',
    templateCategory: draft.templateCategory,
    selectedContactIds: draft.selectedContactIds,
  });
}

/**
 * Loads a saved session. An old single `draft` moves into `drafts` under its moment (one with no
 * moment chosen holds nothing worth keeping and is dropped), and C2 is applied to every draft.
 */
function migrateSession(stored: StoredSession): Session {
  const { draft, drafts: savedDrafts, ...rest } = stored;
  const drafts: Session['drafts'] = {};
  const draftsUpdatedAt: NonNullable<Session['draftsUpdatedAt']> = { ...stored.draftsUpdatedAt };
  for (const [category, saved] of Object.entries(savedDrafts ?? {})) {
    if (saved) drafts[category as TemplateCategory] = stripSentWording(saved);
  }
  const old = draft?.templateCategory;
  if (draft && old && !drafts[old]) {
    drafts[old] = stripSentWording(draft);
    draftsUpdatedAt[old] ??= stored.lastOpenedAt;
  }
  // Sessions saved before sharing have no flowId: give one now. It is saved straight after load,
  // so it is the same on every later load.
  return {
    ...rest,
    flowId: stored.flowId ?? generateFlowId(),
    ownerId: stored.ownerId ?? null,
    role: stored.role ?? 'owner',
    drafts,
    draftsUpdatedAt,
  };
}

function load(storage: SendFlowStorage | undefined): Session[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return (parsed as StoredSession[]).map(migrateSession);
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

/**
 * A UUID v4. Uses `crypto.randomUUID`, else `crypto.getRandomValues`, else `Math.random` (Hermes
 * may have neither). The id only has to be unique, not secret, so the last resort is acceptable.
 */
export function generateFlowId(): string {
  const c = (
    globalThis as {
      crypto?: { randomUUID?: () => string; getRandomValues?: (a: Uint8Array) => unknown };
    }
  ).crypto;
  if (typeof c?.randomUUID === 'function') return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof c?.getRandomValues === 'function') {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Updates one session from a server record. Only fact fields without a pending edit can change. */
function mergeRecordIntoSession(
  session: Session,
  record: FlowRecord,
  pending: Iterable<FlowFactKey>,
  myUserId: string,
): Session {
  const pendingKeys = new Set(pending);
  const local = toFlowFacts(session);
  const merged = mergeFlowFacts(local, record.facts, pendingKeys);
  const mapped = flowFactsToSessionFields(merged);
  // Only write fields that really changed, so text being typed is not rewritten (trimmed etc.).
  const changed: Record<string, unknown> = {};
  for (const key of FLOW_FACT_KEYS) {
    if (!pendingKeys.has(key) && merged[key] !== local[key]) changed[key] = mapped[key];
  }
  const facts = { ...session, ...(changed as Partial<ReturnType<typeof flowFactsToSessionFields>>) };
  const mine = record.ownerId === myUserId;
  // Made on this device and not tied to an account: only the account's own record may claim it.
  if (session.ownerId === null && !mine) return facts;
  return { ...facts, ownerId: record.ownerId, role: mine ? 'owner' : 'member' };
}

function sessionFromRecord(record: FlowRecord): Session {
  const now = new Date().toISOString();
  // A person that arrives from the server must not jump ahead of the one being worked on.
  const updated = Date.parse(record.updatedAt);
  const lastOpenedAt = new Date(Number.isNaN(updated) ? 0 : updated).toISOString();
  return {
    ...flowFactsToSessionFields(record.facts),
    id: newId(),
    flowId: record.id,
    ownerId: record.ownerId,
    role: 'member',
    senderName: '',
    createdAt: now,
    lastOpenedAt,
    drafts: {},
    draftsUpdatedAt: {},
    recipientsNotified: {},
    momentCompletedAt: {},
    remindersScheduled: [],
  };
}

const MOMENT_KEY_BY_CATEGORY: Partial<Record<TemplateCategory, MomentKey>> = {
  announcement: 'announce',
  service: 'service',
  obituary: 'obituary',
  aftercare: 'thanks',
};

export function useSessions(storage?: SendFlowStorage): UseSessionsResult {
  const [sessions, setSessions] = useState<Session[]>(() => load(storage));
  // removeSession must return its boolean synchronously, but a setState updater runs later, so the
  // latest list is read from this ref (also updated in removeSession itself for back-to-back calls).
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;

  useEffect(() => {
    save(storage, sessions);
  }, [storage, sessions]);

  const createSession = useCallback((details?: Partial<SessionDetails>) => {
    const now = new Date().toISOString();
    const session: Session = {
      id: newId(),
      flowId: generateFlowId(),
      ownerId: null,
      role: 'owner',
      personName: '',
      dateOfPassing: '',
      senderName: '',
      obituaryUrl: '',
      ...details,
      createdAt: now,
      lastOpenedAt: now,
      drafts: {},
      draftsUpdatedAt: {},
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

  const updateDraft = useCallback((id: string, incoming: SendFlowDraft) => {
    const draft = stripSentWording(incoming);
    const category = draft.templateCategory;
    // Before a moment is chosen there is nothing to keep, and no slot to keep it in.
    if (!category) return;
    const now = new Date().toISOString();
    setSessions((list) =>
      list.map((s) => {
        if (s.id !== id) return s;
        const existing = s.drafts[category];
        if (existing && JSON.stringify(existing) === JSON.stringify(draft)) return s;
        // Only this moment's slot changes; the other moments' drafts stay as they are.
        return {
          ...s,
          drafts: { ...s.drafts, [category]: draft },
          draftsUpdatedAt: { ...s.draftsUpdatedAt, [category]: now },
        };
      }),
    );
  }, []);

  const clearDraft = useCallback((id: string, category: TemplateCategory) => {
    setSessions((list) =>
      list.map((s) => {
        if (s.id !== id || !s.drafts[category]) return s;
        // Only this moment's slot goes; recipientsNotified and the person's details are not drafts.
        const { [category]: _removed, ...drafts } = s.drafts;
        const { [category]: _removedAt, ...draftsUpdatedAt } = s.draftsUpdatedAt ?? {};
        return { ...s, drafts, draftsUpdatedAt };
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

  const removeSession = useCallback((id: string): boolean => {
    const target = sessionsRef.current.find((s) => s.id === id);
    if (!target || target.role === 'member') return false;
    sessionsRef.current = sessionsRef.current.filter((s) => s.id !== id);
    setSessions((list) => list.filter((s) => s.id !== id));
    return true;
  }, []);

  const pruneEmpty = useCallback(() => {
    setSessions((list) =>
      list.filter((s) => s.personName.trim() !== '' || Object.keys(s.drafts).length > 0),
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

  const applyRemoteFlows = useCallback<UseSessionsResult['applyRemoteFlows']>(
    ({ flows, dropped = 0 }, myUserId, pendingByFlow = {}) => {
      if (!myUserId) return;
      const returned = new Map(flows.map((r) => [r.id, r]));
      setSessions((list) => {
        const known = new Set(list.map((s) => s.flowId));
        const updated = list
          // Losing access removes a shared person; a person this user owns is never removed here.
          .filter((s) => dropped > 0 || s.role !== 'member' || returned.has(s.flowId))
          .map((s) => {
            const record = returned.get(s.flowId);
            return record ? mergeRecordIntoSession(s, record, pendingByFlow[s.flowId] ?? [], myUserId) : s;
          });
        const added = [...returned.values()].filter((r) => !known.has(r.id)).map(sessionFromRecord);
        return [...updated, ...added];
      });
    },
    [],
  );

  const inProgressSessions = useMemo(
    () =>
      sessions
        .filter((s) => {
          const kept = Object.values(s.drafts);
          // A session whose every draft is a finished send has nothing left in progress.
          const allSent = kept.length > 0 && kept.every((d) => d.step === 'sent');
          return (s.personName.trim() !== '' || kept.length > 0) && !allSent;
        })
        .sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt)),
    [sessions],
  );

  return {
    sessions,
    inProgressSessions,
    createSession,
    updateSession,
    updateDraft,
    clearDraft,
    touchSession,
    deleteSession,
    removeSession,
    pruneEmpty,
    setServiceReady,
    scheduleReminder,
    recordMomentComplete,
    applyRemoteFlows,
  };
}
