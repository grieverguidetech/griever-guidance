import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ChecklistFields,
  ChecklistItemId,
  ChecklistItemState,
  FlowRole,
  MomentKey,
  SectionFields,
  SectionKey,
  SectionStatus,
  ServiceEventFields,
  SessionDetails,
  TemplateCategory,
} from '@griever/shared';
import type { FlowRecord, SyncedKey } from '@griever/shared';
import {
  addDays,
  flowDetailsToSessionFields,
  flowFactsToSessionFields,
  CHECKLIST_PHASES,
  FLOW_FACT_KEYS,
  mergeSyncedFieldsWithChanges,
  parseCompleteDate,
  SECTION_ORDER,
  toSyncedFields,
  withServicePair,
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
export interface Session extends SessionDetails, SectionFields, ServiceEventFields, ChecklistFields {
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

/** What an edit can change on a session: the person's details and every section field. */
export type SessionPatch = Partial<SessionDetails & SectionFields & ServiceEventFields>;

export interface UseSessionsResult {
  /** True after a failed storage write; false again after the next successful write. */
  saveFailed: boolean;
  sessions: Session[];
  inProgressSessions: Session[];
  createSession: (details?: Partial<SessionDetails>) => Session;
  updateSession: (id: string, patch: SessionPatch) => void;
  /** Applies the patch, and marks the section `in_progress` only when it has no status yet (`ready` stays). */
  updateSection: (id: string, key: SectionKey, patch: SessionPatch) => void;
  /** `null` removes the status (Not started). For 'service', `ready` also sets `serviceReady`, any other value clears it. */
  setSectionStatus: (id: string, key: SectionKey, status: SectionStatus | null) => void;
  /** Sets one checklist item on one person. `null` removes the key (the item is open again). Other people are unchanged. */
  setChecklistItem: (id: string, itemId: ChecklistItemId, state: ChecklistItemState | null) => void;
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
    pendingByFlow?: Readonly<Record<string, Iterable<SyncedKey>>>,
  ) => void;
}

/** Sessions with a person's name, most recently opened first. The first is the one that reopens. */
export function namedSessionsByRecent(sessions: Session[]): Session[] {
  return sessions
    .filter((s) => s.personName.trim() !== '')
    .sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt));
}

/**
 * Sessions worth listing in the editor: a name, or any content (so work on someone not yet named
 * stays reachable). Most recently opened first.
 */
export function listableSessionsByRecent(sessions: Session[]): Session[] {
  return sessions
    .filter((s) => s.personName.trim() !== '' || hasAnyContent(s))
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
 * People the owner removed on this device (`removeSession`). Device-local and shared by every
 * account on the device, so each mark names the account that owned the person (`ownerId`, null
 * when the session was never tied to an account). `useFlowSync` keeps a marked person out of that
 * owner's pulls until the server stops listing them.
 *
 * Storage rules: `useFlowSync`'s `storage` option must be the same object as the one given to
 * `useSessions`. The mobile session cache must also hydrate this key when sync is wired there.
 */
export const REMOVED_FLOWS_STORAGE_KEY = 'gg.removedFlows.v1';

export interface RemovedFlow {
  id: string;
  ownerId: string | null;
}

/** The marks, or null when they could not be read (callers must not overwrite then). */
export function readRemovedFlows(storage: SendFlowStorage | undefined): RemovedFlow[] | null {
  if (!storage) return [];
  try {
    const raw = storage.getItem(REMOVED_FLOWS_STORAGE_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const marks: RemovedFlow[] = [];
    for (const item of parsed) {
      if (typeof item === 'string') marks.push({ id: item, ownerId: null });
      else if (item && typeof item === 'object' && typeof (item as RemovedFlow).id === 'string') {
        const owner = (item as RemovedFlow).ownerId;
        marks.push({ id: (item as RemovedFlow).id, ownerId: typeof owner === 'string' ? owner : null });
      }
    }
    return marks;
  } catch {
    return null;
  }
}

export function writeRemovedFlows(storage: SendFlowStorage | undefined, marks: readonly RemovedFlow[]): void {
  try {
    storage?.setItem(REMOVED_FLOWS_STORAGE_KEY, JSON.stringify(marks));
  } catch {
    // storage unavailable: the person is still removed for this run
  }
}

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

const SECTION_STATUSES: readonly string[] = ['in_progress', 'ready'];

/** Keeps only known section keys with an 'in_progress' or 'ready' status. Anything else is dropped. */
function cleanSectionStatus(stored: unknown): SectionFields['sectionStatus'] {
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
    return undefined;
  }
  const clean: Partial<Record<SectionKey, SectionStatus>> = {};
  for (const [key, value] of Object.entries(stored)) {
    const knownKey = (SECTION_ORDER as readonly string[]).includes(key);
    if (knownKey && typeof value === 'string' && SECTION_STATUSES.includes(value)) {
      clean[key as SectionKey] = value as SectionStatus;
    }
  }
  return clean;
}

const CHECKLIST_ITEM_IDS: readonly string[] = CHECKLIST_PHASES.flatMap((phase) => phase.itemIds);
const CHECKLIST_STATES: readonly string[] = ['done', 'not_applicable'];

/** Keeps only known item ids with a 'done' or 'not_applicable' state. Returns undefined when nothing is left. */
function cleanChecklist(stored: unknown): ChecklistFields['checklist'] {
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
    return undefined;
  }
  const clean: NonNullable<ChecklistFields['checklist']> = {};
  for (const [key, value] of Object.entries(stored)) {
    if (CHECKLIST_ITEM_IDS.includes(key) && typeof value === 'string' && CHECKLIST_STATES.includes(value)) {
      clean[key as ChecklistItemId] = value as ChecklistItemState;
    }
  }
  return Object.keys(clean).length > 0 ? clean : undefined;
}

/** Service draft field -> session field. Other fields are written in place, never copied. */
const SERVICE_DRAFT_COPIES = [
  ['serviceTime', 'serviceTime'],
  ['serviceLocation', 'servicePlace'],
  ['serviceNotes', 'serviceNotes'],
] as const;

/**
 * Copies typed service details from the service draft into session fields that were never set
 * (`undefined`). A field cleared to '' is not undefined, so it is never copied again. The draft
 * is not changed. When anything is copied and the section has no status, it becomes `in_progress`.
 */
function copyServiceDraftFields(session: Session): Session {
  const draftFields = session.drafts.service?.fields;
  if (!draftFields) {
    return session;
  }
  const copied: Partial<SectionFields> = {};
  for (const [from, to] of SERVICE_DRAFT_COPIES) {
    const value = draftFields[from]?.trim();
    if (value && session[to] === undefined) {
      copied[to] = value;
    }
  }
  if (Object.keys(copied).length === 0) {
    return session;
  }
  const sectionStatus = session.sectionStatus ?? {};
  return {
    ...session,
    ...copied,
    sectionStatus: { ...sectionStatus, service: sectionStatus.service ?? 'in_progress' },
  };
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
  const migrated: Session = {
    ...rest,
    flowId: stored.flowId ?? generateFlowId(),
    ownerId: stored.ownerId ?? null,
    role: stored.role ?? 'owner',
    drafts,
    draftsUpdatedAt,
  };
  if (stored.sectionStatus !== undefined) {
    const sectionStatus = cleanSectionStatus(stored.sectionStatus);
    if (sectionStatus) {
      migrated.sectionStatus = sectionStatus;
    } else {
      delete migrated.sectionStatus;
    }
  }
  if (stored.checklist !== undefined) {
    const checklist = cleanChecklist(stored.checklist);
    if (checklist) {
      migrated.checklist = checklist;
    } else {
      delete migrated.checklist;
    }
  }
  // An old session with the synced "service ready" flag but no stored status shows as ready.
  if (migrated.serviceReady === true && migrated.sectionStatus?.service === undefined) {
    migrated.sectionStatus = { ...migrated.sectionStatus, service: 'ready' };
  }
  return copyServiceDraftFields(migrated);
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

/** Returns false when the write failed (sessions still work for this tab's lifetime). */
function save(storage: SendFlowStorage | undefined, sessions: Session[]): boolean {
  if (!storage) return true;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    return true;
  } catch {
    return false;
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

/** Updates one session from a server record. Only synced fields without a pending edit can change. */
function mergeRecordIntoSession(
  session: Session,
  record: FlowRecord,
  pending: Iterable<SyncedKey>,
  myUserId: string,
): Session {
  const local = toSyncedFields(session);
  const { changed } = mergeSyncedFieldsWithChanges(
    local,
    { ...record.facts, ...record.details },
    withServicePair(pending),
  );
  // Only the changed keys are written, so text being typed or a pending edit is never rewritten.
  const wire: Record<string, unknown> = { ...changed };
  const factKeys = new Set<string>(FLOW_FACT_KEYS);
  const factPatch: Record<string, unknown> = {};
  const detailPatch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(wire)) {
    (factKeys.has(key) ? factPatch : detailPatch)[key] = value;
  }
  const mappedFacts = flowFactsToSessionFields({ ...local, ...factPatch });
  const fromFacts: Record<string, unknown> = {};
  for (const key of Object.keys(factPatch)) {
    fromFacts[key] = mappedFacts[key as keyof typeof mappedFacts];
  }
  const fromDetails = flowDetailsToSessionFields(detailPatch, session.sectionStatus);
  const updated = { ...session, ...fromFacts, ...fromDetails } as Session;
  const mine = record.ownerId === myUserId;
  // Made on this device and not tied to an account: only the account's own record may claim it.
  if (session.ownerId === null && !mine) {
    return updated;
  }
  return { ...updated, ownerId: record.ownerId, role: mine ? 'owner' : 'member' };
}

function sessionFromRecord(record: FlowRecord, myUserId: string): Session {
  const now = new Date().toISOString();
  // A person that arrives from the server must not jump ahead of the one being worked on.
  const updated = Date.parse(record.updatedAt);
  const lastOpenedAt = new Date(Number.isNaN(updated) ? 0 : updated).toISOString();
  const details = flowDetailsToSessionFields(record.details ?? {});
  const facts = flowFactsToSessionFields(record.facts);
  return {
    ...facts,
    ...details,
    id: newId(),
    flowId: record.id,
    ownerId: record.ownerId,
    // Ownership decides the role, not the server's per-record flag: your own record is yours.
    role: record.ownerId === myUserId ? 'owner' : 'member',
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

/** True when a person holds anything worth keeping: a name, a draft, a section status or any typed field. */
function hasAnyContent(s: Session): boolean {
  if (s.personName.trim() !== '' || Object.keys(s.drafts).length > 0) {
    return true;
  }
  if (Object.keys(s.checklist ?? {}).length > 0) {
    return true;
  }
  if (Object.keys(s.sectionStatus ?? {}).length > 0) {
    return true;
  }
  return Object.entries(s).some(([key, value]) => {
    if (!EDITOR_FIELDS.has(key)) {
      return false;
    }
    return typeof value === 'string' ? value.trim() !== '' : value === true;
  });
}

/** Typed fields that are not the name: person details and every section and service-event field. */
const EDITOR_FIELDS: ReadonlySet<string> = new Set([
  'dateOfPassing', 'obituaryUrl', 'serviceDate', 'birthDate', 'serviceType', 'serviceTime', 'servicePlace',
  'serviceAddress', 'serviceNotes', 'serviceMessage', 'announcementMessage', 'obituaryText', 'obituaryCity', 'obituaryCareer', 'obituarySurvivors',
  'obituaryNote', 'thanksMessage',
  'visitationDate', 'visitationTime', 'visitationPlace', 'serviceOfficiant', 'burialDate', 'burialTime',
  'burialPlace', 'burialPrivate', 'receptionDate', 'receptionTime', 'receptionPlace',
]);

export function useSessions(storage?: SendFlowStorage): UseSessionsResult {
  const [sessions, setSessions] = useState<Session[]>(() => load(storage));
  // removeSession must return its boolean synchronously, but a setState updater runs later, so the
  // latest list is read from this ref (also updated in removeSession itself for back-to-back calls).
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;

  const [saveFailed, setSaveFailed] = useState(false);

  useEffect(() => {
    setSaveFailed(!save(storage, sessions));
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

  const updateSession = useCallback((id: string, patch: SessionPatch) => {
    setSessions((list) =>
      list.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    );
  }, []);

  const updateSection = useCallback((id: string, key: SectionKey, patch: SessionPatch) => {
    setSessions((list) =>
      list.map((s) => {
        if (s.id !== id) {
          return s;
        }
        const sectionStatus = { ...s.sectionStatus };
        sectionStatus[key] ??= 'in_progress';
        return { ...s, ...patch, sectionStatus };
      }),
    );
  }, []);

  const setSectionStatus = useCallback(
    (id: string, key: SectionKey, status: SectionStatus | null) => {
      setSessions((list) =>
        list.map((s) => {
          if (s.id !== id) {
            return s;
          }
          const sectionStatus = { ...s.sectionStatus };
          if (status === null) {
            delete sectionStatus[key];
          } else {
            sectionStatus[key] = status;
          }
          const next: Session = { ...s, sectionStatus };
          if (key === 'service') {
            next.serviceReady = status === 'ready';
          }
          return next;
        }),
      );
    },
    [],
  );

  const setChecklistItem = useCallback(
    (id: string, itemId: ChecklistItemId, state: ChecklistItemState | null) => {
      setSessions((list) =>
        list.map((s) => {
          if (s.id !== id) {
            return s;
          }
          const checklist = { ...s.checklist };
          if (state === null) {
            delete checklist[itemId];
          } else {
            checklist[itemId] = state;
          }
          return { ...s, checklist };
        }),
      );
    },
    [],
  );

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
    // Explicit mark: sync only hides a person from pulls when the owner chose to remove them.
    // An unreadable list is left alone: writing now would drop the earlier marks.
    const marks = readRemovedFlows(storage);
    if (marks) writeRemovedFlows(storage, [...marks.filter((m) => m.id !== target.flowId), { id: target.flowId, ownerId: target.ownerId }]);
    setSessions((list) => list.filter((s) => s.id !== id));
    return true;
  }, [storage]);

  const pruneEmpty = useCallback(() => {
    setSessions((list) => list.filter(hasAnyContent));
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
        const added = [...returned.values()].filter((r) => !known.has(r.id)).map((r) => sessionFromRecord(r, myUserId));
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
    saveFailed,
    sessions,
    inProgressSessions,
    createSession,
    updateSession,
    updateSection,
    setSectionStatus,
    setChecklistItem,
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
