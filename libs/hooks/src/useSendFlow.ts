import { useCallback, useEffect, useMemo, useState } from 'react';
import { templates, composeMessage, MOMENT_KEY_BY_CATEGORY } from '@griever/shared';
import type {
  Template,
  TemplateCategory,
  MessageTone,
  MomentKey,
  Place,
  RecipientDeliveryStatus,
  SessionDetails,
} from '@griever/shared';

export type SendFlowStep =
  | 'template'
  | 'announce'
  | 'serviceKnown'
  | 'details'
  | 'contacts'
  | 'review'
  | 'sending'
  | 'sent';

export type ServiceDetailsKnown = 'yes' | 'no' | null;

/**
 * One entry per recipient in the one-at-a-time `sms:` handoff loop
 * (tasks/04-sending.md §2/§4). `confirmed` is set only by the user
 * answering "did that go through?" — never inferred from elapsed time or
 * from the app being backgrounded.
 */
export interface SendJobEntry {
  contactId: string;
  status: RecipientDeliveryStatus;
  handedOffAt?: number;
  confirmedAt?: number;
}

export interface SendJob {
  jobId: string;
  sessionId: string;
  momentKey: MomentKey;
  entries: SendJobEntry[];
  cursorIndex: number;
  createdAt: number;
}

/**
 * The persisted half of the send job — a local handoff log only (DATA.md
 * §1: "Device capabilities ... Never mirrored to the server"). Injected so
 * this hook stays platform-agnostic (CLAUDE.md rule 4): web passes
 * `@griever/data-local`'s IndexedDB-backed `sendJobStore`, whose `put`/
 * `listBySessionId` already match this shape structurally.
 */
export interface SendJobStore {
  listBySessionId(sessionId: string): Promise<SendJob[]>;
  put(job: SendJob): Promise<void>;
}

export interface SendFlowState {
  step: SendFlowStep;
  templateCategory: TemplateCategory | null;
  /** Explicit template, used by the "share an obituary link" entry point. */
  templateOverrideId: string | null;
  fields: Record<string, string>;
  serviceDetailsKnown: ServiceDetailsKnown;
  selectedContactIds: string[];
  place: Place | null;
  includeFlowers: boolean;
  floristId: string | null;
  customFlorist: string;
  flowerDeliveryTarget: 'service' | 'home';
  tone: MessageTone;
  /** Set when the griever hand-edits the wording; pins the draft. */
  messageOverride: string | null;
  sendJob: SendJob | null;
}

/** The persisted subset of the flow state (everything but the live send job). */
export type SendFlowDraft = Omit<SendFlowState, 'sendJob'>;

export interface SendFlowActions {
  setTemplateCategory: (category: TemplateCategory) => void;
  setTemplate: (template: Template) => void;
  setField: (key: string, value: string) => void;
  setPlace: (place: Place | null) => void;
  setServiceDetailsKnown: (value: 'yes' | 'no') => void;
  toggleContact: (contactId: string) => void;
  selectContacts: (contactIds: string[]) => void;
  setIncludeFlowers: (value: boolean) => void;
  setFlorist: (floristId: string | null) => void;
  setCustomFlorist: (value: string) => void;
  setFlowerDeliveryTarget: (target: 'service' | 'home') => void;
  setTone: (tone: MessageTone) => void;
  setMessageOverride: (value: string | null) => void;
  startSendJob: () => void;
  /**
   * Marks the active recipient `handed_off` and **persists that before
   * returning** — the caller must `await` this before setting
   * `location.href`, not after (tasks/04-sending.md §2: the loop position
   * has to survive a force-quit that happens mid-handoff, not just
   * mid-review).
   */
  handOffActive: () => Promise<void>;
  /** The user answered "did that go through?" — advances to the next recipient either way. */
  confirmActive: (confirmed: boolean) => void;
  /** Skips the active recipient (before any handoff) and advances. */
  skipActive: () => void;
  nextStep: () => void;
  prevStep: () => void;
  reset: () => void;
  /** B6 → Flow A for the same session, keeping the recipient list. */
  restartForServiceDetails: () => void;
  /** A5 "Send another message" → back to the picker for the same session. */
  startAnotherMessage: () => void;
}

export interface SendFlowDerived {
  selectedTemplate: Template | null;
  steps: SendFlowStep[];
  session: SessionDetails | null;
  composedFields: Record<string, string>;
  composedMessage: string;
}

const STORAGE_KEY = 'gg.sendflow.v1';

/**
 * Minimal synchronous key/value store. The web app passes `window.localStorage`;
 * this keeps the hook free of any platform (`window`/DOM) reference so it stays
 * usable from `apps/mobile` (which would pass its own adapter).
 */
export interface SendFlowStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const initialState: SendFlowState = {
  step: 'template',
  templateCategory: null,
  templateOverrideId: null,
  fields: {},
  serviceDetailsKnown: null,
  selectedContactIds: [],
  place: null,
  includeFlowers: false,
  floristId: null,
  customFlorist: '',
  flowerDeliveryTarget: 'service',
  tone: 'plain',
  messageOverride: null,
  sendJob: null,
};

/** A fresh draft, for callers that need to hand a session a pre-set starting step (e.g. C4 → C5). */
export function freshDraft(patch: Partial<SendFlowDraft>): SendFlowDraft {
  const { sendJob: _sendJob, ...draft } = initialState;
  return { ...draft, ...patch };
}

function fromDraft(draft: SendFlowDraft): SendFlowState {
  const restored: SendFlowState = { ...initialState, ...draft, sendJob: null };
  // A real in-progress job (if any) is restored asynchronously from
  // `sendJobStore` right after mount — this is just the synchronous-render
  // fallback for the moment before that lookup resolves.
  if (restored.step === 'sending') restored.step = 'review';
  return restored;
}

function toDraft(state: SendFlowState): SendFlowDraft {
  const { sendJob: _sendJob, ...draft } = state;
  return draft;
}

function loadState(storage: SendFlowStorage | undefined): SendFlowState {
  if (!storage) return initialState;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return initialState;
    return fromDraft(JSON.parse(raw) as SendFlowDraft);
  } catch {
    return initialState;
  }
}

function persist(storage: SendFlowStorage | undefined, state: SendFlowState): void {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(toDraft(state)));
  } catch {
    // storage unavailable (private mode, quota) — the flow still works in-memory
  }
}

function clearPersisted(storage: SendFlowStorage | undefined): void {
  if (!storage) return;
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

function resolveTemplate(state: SendFlowState): Template | null {
  if (state.templateOverrideId) {
    return templates.find((t) => t.id === state.templateOverrideId) ?? null;
  }
  if (!state.templateCategory) return null;
  return templates.find((t) => t.category === state.templateCategory) ?? null;
}

function stepsFor(state: SendFlowState, template: Template | null): SendFlowStep[] {
  const category = template?.category ?? state.templateCategory;
  if (category === 'announcement') {
    const middle: SendFlowStep[] =
      state.serviceDetailsKnown === 'yes' ? ['details'] : [];
    return [
      'template',
      'announce',
      'serviceKnown',
      ...middle,
      'contacts',
      'review',
      'sending',
      'sent',
    ];
  }
  if (category === 'obituary') {
    // No sms: loop here — the review screen shares directly via
    // navigator.share() (tasks/04-sending.md §3), so there's no 'sending' step.
    return ['template', 'contacts', 'review', 'sent'];
  }
  return ['template', 'details', 'contacts', 'review', 'sending', 'sent'];
}

/**
 * Flatten the flow state (+ session + resolved florist name) into the string
 * map that `renderMessage` consumes on both the client and the API, so the
 * preview and the sent message can never drift.
 */
function buildComposedFields(
  state: SendFlowState,
  floristName: string,
  session: SessionDetails | null | undefined,
): Record<string, string> {
  const fields: Record<string, string> = { ...state.fields };

  if (session) {
    if (session.personName) fields['deceasedName'] = session.personName;
    if (session.dateOfPassing) fields['dateOfPassing'] = session.dateOfPassing;
    if (session.senderName) fields['senderName'] = session.senderName;
    if (session.obituaryUrl) fields['obituaryUrl'] = session.obituaryUrl;
  }

  if (state.place) fields['serviceLocation'] = state.place.formattedAddress;
  fields['tone'] = state.tone;
  if (state.serviceDetailsKnown) fields['serviceDetailsKnown'] = state.serviceDetailsKnown;
  if (state.includeFlowers && floristName) {
    fields['floristName'] = floristName;
    fields['flowerDeliveryTarget'] = state.flowerDeliveryTarget;
  }
  return fields;
}

/** Build the field map for a resolved florist name (used by the review step). */
export function composedFieldsWithFlorist(
  state: SendFlowState & { session?: SessionDetails | null },
  floristName: string,
): Record<string, string> {
  return buildComposedFields(state, floristName, state.session ?? null);
}

function newJobId(): string {
  return `job_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export interface UseSendFlowOptions {
  /** The person every message in this flow is about. */
  session?: SessionDetails | null;
  /** The session's id — required to key/resume a persisted send job. */
  sessionId?: string;
  /** Draft to restore (from the session). Overrides `storage` when present. */
  draft?: SendFlowDraft | null;
  /** Called on every state change so the caller can persist the draft. */
  onDraftChange?: (draft: SendFlowDraft) => void;
  /** Fallback persistence when there is no session (standalone / mobile). */
  storage?: SendFlowStorage;
  /** The local handoff log — omit to run the send job in memory only (no crash resume). */
  sendJobStore?: SendJobStore;
}

export function useSendFlow(
  options: UseSendFlowOptions = {},
): SendFlowState & SendFlowActions & SendFlowDerived {
  const { session = null, sessionId, draft = null, onDraftChange, storage, sendJobStore } = options;

  const [state, setState] = useState<SendFlowState>(() =>
    draft ? fromDraft(draft) : loadState(storage),
  );

  useEffect(() => {
    if (onDraftChange) {
      onDraftChange(toDraft(state));
    } else {
      persist(storage, state);
    }
  }, [state, onDraftChange, storage]);

  // Resume an in-progress send job after a crash/relaunch (tasks/04-sending.md
  // §2's "force-quitting ... resumes the loop at the right person"). Runs
  // once per (sessionId, sendJobStore) — i.e. once per mount, since Flow.tsx
  // keys the whole flow by session id already.
  useEffect(() => {
    if (!sendJobStore || !sessionId) return;
    let cancelled = false;
    (async () => {
      const category = resolveTemplate(state)?.category ?? state.templateCategory;
      const momentKey = category ? MOMENT_KEY_BY_CATEGORY[category] : null;
      if (!momentKey) return;
      const jobs = await sendJobStore.listBySessionId(sessionId);
      const incomplete = jobs.find(
        (j) => j.momentKey === momentKey && j.cursorIndex < j.entries.length,
      );
      if (!cancelled && incomplete) {
        setState((s) => ({ ...s, sendJob: incomplete, step: 'sending' }));
      }
    })();
    return () => {
      cancelled = true;
    };
    // Deliberately only re-runs when the store/session identity changes —
    // this is a one-time-per-mount resume check, not a live subscription.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sendJobStore, sessionId]);

  const selectedTemplate = useMemo(() => resolveTemplate(state), [state]);
  const steps = useMemo(
    () => stepsFor(state, selectedTemplate),
    [state, selectedTemplate],
  );

  const composedFields = useMemo(
    () => buildComposedFields(state, state.customFlorist.trim(), session),
    [state, session],
  );

  const composedMessage = state.messageOverride
    ? state.messageOverride
    : composeMessage(selectedTemplate, composedFields);

  const setTemplateCategory = useCallback((category: TemplateCategory) => {
    setState(() => ({
      ...initialState,
      step: 'template',
      templateCategory: category,
      templateOverrideId: null,
    }));
  }, []);

  const setTemplate = useCallback((template: Template) => {
    setState(() => ({
      ...initialState,
      step: 'template',
      templateCategory: template.category,
      templateOverrideId: template.id,
    }));
  }, []);

  const setField = useCallback((key: string, value: string) => {
    setState((s) => ({ ...s, fields: { ...s.fields, [key]: value }, messageOverride: null }));
  }, []);

  const setPlace = useCallback((place: Place | null) => {
    setState((s) => ({
      ...s,
      place,
      fields: {
        ...s.fields,
        serviceLocation: place ? place.formattedAddress : s.fields['serviceLocation'] ?? '',
      },
      messageOverride: null,
    }));
  }, []);

  const setServiceDetailsKnown = useCallback((value: 'yes' | 'no') => {
    setState((s) => ({ ...s, serviceDetailsKnown: value, messageOverride: null }));
  }, []);

  const toggleContact = useCallback((contactId: string) => {
    setState((s) => {
      const has = s.selectedContactIds.includes(contactId);
      return {
        ...s,
        selectedContactIds: has
          ? s.selectedContactIds.filter((id) => id !== contactId)
          : [...s.selectedContactIds, contactId],
      };
    });
  }, []);

  const selectContacts = useCallback((contactIds: string[]) => {
    setState((s) => ({
      ...s,
      selectedContactIds: Array.from(
        new Set([...s.selectedContactIds, ...contactIds]),
      ),
    }));
  }, []);

  const setIncludeFlowers = useCallback((value: boolean) => {
    setState((s) => ({ ...s, includeFlowers: value, messageOverride: null }));
  }, []);

  const setFlorist = useCallback((floristId: string | null) => {
    setState((s) => ({ ...s, floristId, messageOverride: null }));
  }, []);

  const setCustomFlorist = useCallback((value: string) => {
    setState((s) => ({ ...s, customFlorist: value, messageOverride: null }));
  }, []);

  const setFlowerDeliveryTarget = useCallback((target: 'service' | 'home') => {
    setState((s) => ({ ...s, flowerDeliveryTarget: target, messageOverride: null }));
  }, []);

  const setTone = useCallback((tone: MessageTone) => {
    setState((s) => ({ ...s, tone, messageOverride: null }));
  }, []);

  const setMessageOverride = useCallback((value: string | null) => {
    setState((s) => ({ ...s, messageOverride: value }));
  }, []);

  // Reads `state` directly (not the setState-functional form) so the
  // `sendJobStore.put()` side effect below runs exactly once — React 18
  // StrictMode double-invokes a functional updater to catch exactly this
  // class of bug (a side effect inside `setState(s => ...)` fires twice and
  // silently wrote two jobs for one tap the first time this was tried here).
  const startSendJob = useCallback(() => {
    const category = resolveTemplate(state)?.category ?? state.templateCategory;
    const momentKey = category ? MOMENT_KEY_BY_CATEGORY[category] : null;
    if (!momentKey || !sessionId) return;
    const job: SendJob = {
      jobId: newJobId(),
      sessionId,
      momentKey,
      entries: state.selectedContactIds.map((contactId) => ({
        contactId,
        status: 'queued' as RecipientDeliveryStatus,
      })),
      cursorIndex: 0,
      createdAt: Date.now(),
    };
    void sendJobStore?.put(job);
    setState((s) => ({ ...s, step: 'sending', sendJob: job }));
  }, [state, sessionId, sendJobStore]);

  // Reused by confirmActive/skipActive: optionally writes the active entry's
  // new status (omit to leave it as-is — "Not yet" keeps it `handed_off`),
  // advances the cursor, persists, and completes the loop once every entry
  // has an answer. Same reasoning as `startSendJob` above for reading
  // `state.sendJob` directly rather than persisting inside the updater.
  const advanceActive = useCallback(
    (status?: 'confirmed' | 'skipped') => {
      const job = state.sendJob;
      if (!job) return;
      const { cursorIndex, entries } = job;
      if (cursorIndex >= entries.length) return;
      const updatedEntries = entries.map((entry, i) => {
        if (i !== cursorIndex) return entry;
        if (!status) return entry;
        return {
          ...entry,
          status,
          ...(status === 'confirmed' ? { confirmedAt: Date.now() } : {}),
        };
      });
      const nextCursor = cursorIndex + 1;
      const updatedJob: SendJob = { ...job, entries: updatedEntries, cursorIndex: nextCursor };
      void sendJobStore?.put(updatedJob);
      const allDone = nextCursor >= updatedJob.entries.length;
      setState((s) => ({ ...s, sendJob: updatedJob, step: allDone ? 'sent' : s.step }));
    },
    [state.sendJob, sendJobStore],
  );

  const handOffActive = useCallback(async () => {
    if (!state.sendJob) return;
    const { cursorIndex, entries } = state.sendJob;
    if (cursorIndex >= entries.length) return;
    const updatedEntries = entries.map((entry, i) =>
      i === cursorIndex ? { ...entry, status: 'handed_off' as RecipientDeliveryStatus, handedOffAt: Date.now() } : entry,
    );
    const job: SendJob = { ...state.sendJob, entries: updatedEntries };
    // Persist BEFORE the caller navigates away — this is the one place the
    // await genuinely has to happen first, not "eventually" (tasks/04-sending
    // .md §2).
    await sendJobStore?.put(job);
    setState((s) => (s.sendJob ? { ...s, sendJob: job } : s));
  }, [state.sendJob, sendJobStore]);

  const confirmActive = useCallback(
    (confirmed: boolean) => advanceActive(confirmed ? 'confirmed' : undefined),
    [advanceActive],
  );

  const skipActive = useCallback(() => advanceActive('skipped'), [advanceActive]);

  const nextStep = useCallback(() => {
    setState((s) => {
      const order = stepsFor(s, resolveTemplate(s));
      const next = order[order.indexOf(s.step) + 1];
      return next ? { ...s, step: next } : s;
    });
  }, []);

  const prevStep = useCallback(() => {
    setState((s) => {
      const order = stepsFor(s, resolveTemplate(s));
      const prev = order[order.indexOf(s.step) - 1];
      return prev ? { ...s, step: prev } : s;
    });
  }, []);

  const reset = useCallback(() => {
    clearPersisted(storage);
    setState(initialState);
  }, [storage]);

  const restartForServiceDetails = useCallback(() => {
    setState((s) => ({
      ...initialState,
      step: 'details',
      templateCategory: 'service',
      templateOverrideId: null,
      selectedContactIds: s.selectedContactIds,
    }));
  }, []);

  const startAnotherMessage = useCallback(() => {
    setState(() => ({ ...initialState, step: 'template' }));
  }, []);

  return {
    ...state,
    selectedTemplate,
    steps,
    session,
    composedFields,
    composedMessage,
    setTemplateCategory,
    setTemplate,
    setField,
    setPlace,
    setServiceDetailsKnown,
    toggleContact,
    selectContacts,
    setIncludeFlowers,
    setFlorist,
    setCustomFlorist,
    setFlowerDeliveryTarget,
    setTone,
    setMessageOverride,
    startSendJob,
    handOffActive,
    confirmActive,
    skipActive,
    nextStep,
    prevStep,
    reset,
    restartForServiceDetails,
    startAnotherMessage,
  };
}
