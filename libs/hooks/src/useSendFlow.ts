import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { templates, composeMessage } from '@griever/shared';
import type {
  Template,
  TemplateCategory,
  MessageTone,
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

export interface RecipientProgress {
  contactId: string;
  status: RecipientDeliveryStatus;
}

export interface SendJob {
  id: string;
  recipients: RecipientProgress[];
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
  /** The active recipient's own Messages app was opened and (we assume) sent — advance the queue. */
  markActiveSent: () => void;
  /** The griever chose not to text this person right now — advance the queue without marking sent. */
  markActiveSkipped: () => void;
  nextStep: () => void;
  prevStep: () => void;
  reset: () => void;
  /** B6 → Flow A for the same session, keeping the recipient list. */
  restartForServiceDetails: () => void;
  /** Empties this moment's draft and returns to its first form. The person, contacts and sent record are not touched. */
  startAgain: () => void;
  /** A5 "Send another message" → back to the picker for the same session. */
  startAnotherMessage: () => void;
}

export interface SendFlowDerived {
  selectedTemplate: Template | null;
  steps: SendFlowStep[];
  session: SessionDetails | null;
  composedFields: Record<string, string>;
  composedMessage: string;
  /** True when the draft holds something typed, a hand-edited message or chosen contacts. */
  hasDraftContent: boolean;
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

/**
 * True when a saved draft has a message under way (a template chosen, nothing being sent), so
 * reopening the app should put the person back in it rather than start the message over.
 * 'sending' is never resumed: the send job isn't saved, and resuming would offer the whole list
 * again. 'sent' is finished.
 */
export function hasDraftInProgress(draft: SendFlowDraft | null | undefined): draft is SendFlowDraft {
  return !!draft && draft.templateCategory !== null && draft.step !== 'sending' && draft.step !== 'sent';
}

/** The first step after the picker, for moments that do not start on the details form. */
const FIRST_STEP: Partial<Record<TemplateCategory, SendFlowStep>> = {
  announcement: 'announce',
  obituary: 'contacts',
};

/**
 * The draft to resume with. A draft sitting on the template picker moves on to the moment's first
 * form, so the picker can't be reached and overwrite what was typed. Fields are left untouched.
 */
export function resumeDraft(draft: SendFlowDraft): SendFlowDraft {
  if (draft.step !== 'template') return draft;
  const first = draft.templateCategory ? FIRST_STEP[draft.templateCategory] : undefined;
  return { ...draft, step: first ?? 'details' };
}

/** True when a draft holds something worth asking about before clearing it. */
export function draftHasContent(draft: Pick<SendFlowDraft, 'fields' | 'messageOverride' | 'selectedContactIds'>): boolean {
  return (
    Object.values(draft.fields).some((value) => value.trim() !== '') ||
    !!draft.messageOverride ||
    draft.selectedContactIds.length > 0
  );
}

function fromDraft(draft: SendFlowDraft): SendFlowState {
  const restored: SendFlowState = { ...initialState, ...draft, sendJob: null };
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
    // The one required field (the link) is gathered on the session in C4,
    // not a per-flow details form — skip straight to recipients.
    return ['template', 'contacts', 'review', 'sending', 'sent'];
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

export interface UseSendFlowOptions {
  /** The person every message in this flow is about. */
  session?: SessionDetails | null;
  /** Draft to restore (from the session). Overrides `storage` when present. */
  draft?: SendFlowDraft | null;
  /**
   * The session's saved drafts. Choosing a moment on the picker restores that moment's own draft
   * when it is in progress, instead of starting it over.
   */
  drafts?: Partial<Record<TemplateCategory, SendFlowDraft>>;
  /** Called on every state change so the caller can persist the draft. */
  onDraftChange?: (draft: SendFlowDraft) => void;
  /** Fallback persistence when there is no session (standalone / mobile). */
  storage?: SendFlowStorage;
}

export function useSendFlow(
  options: UseSendFlowOptions = {},
): SendFlowState & SendFlowActions & SendFlowDerived {
  const { session = null, draft = null, drafts, onDraftChange, storage } = options;
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;

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

  // A moment already under way comes back as it was, not blank. It stays on the picker step, so
  // the picker's own nextStep lands on the moment's first form with everything typed still there.
  const startedState = useCallback((category: TemplateCategory, templateOverrideId: string | null): SendFlowState => {
    const saved = draftsRef.current?.[category];
    if (hasDraftInProgress(saved) && saved.templateOverrideId === templateOverrideId) {
      return { ...fromDraft(saved), step: 'template' };
    }
    return { ...initialState, step: 'template', templateCategory: category, templateOverrideId };
  }, []);

  const setTemplateCategory = useCallback((category: TemplateCategory) => {
    setState((s) => {
      // Choosing what is already chosen keeps what was typed.
      if (s.templateCategory === category && s.templateOverrideId === null) return s;
      return startedState(category, null);
    });
  }, [startedState]);

  const setTemplate = useCallback((template: Template) => {
    setState(() => startedState(template.category, template.id));
  }, [startedState]);

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

  const startSendJob = useCallback(() => {
    setState((s) => ({
      ...s,
      step: 'sending',
      sendJob: {
        id: `job-${Date.now()}`,
        // Only the first recipient is "active" (sms: link ready to open) —
        // the rest wait their turn. One contact at a time, never a bulk send.
        recipients: s.selectedContactIds.map((contactId, i) => ({
          contactId,
          status: (i === 0 ? 'sending' : 'queued') as RecipientDeliveryStatus,
        })),
      },
    }));
  }, []);

  const advanceActive = useCallback((status: 'delivered' | 'skipped') => {
    setState((s) => {
      if (!s.sendJob) return s;
      const idx = s.sendJob.recipients.findIndex((r) => r.status === 'sending');
      if (idx === -1) return s;
      const recipients = s.sendJob.recipients.map((r, i) => {
        if (i === idx) return { ...r, status };
        if (i === idx + 1) return { ...r, status: 'sending' as RecipientDeliveryStatus };
        return r;
      });
      const allDone = recipients.every((r) => r.status === 'delivered' || r.status === 'skipped');
      return {
        ...s,
        sendJob: { ...s.sendJob, recipients },
        step: allDone ? 'sent' : s.step,
      };
    });
  }, []);

  const markActiveSent = useCallback(() => advanceActive('delivered'), [advanceActive]);
  const markActiveSkipped = useCallback(() => advanceActive('skipped'), [advanceActive]);

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
    setState((s) => {
      const saved = draftsRef.current?.service;
      // A service message already under way keeps what was typed; the people just told join its list.
      if (hasDraftInProgress(saved)) {
        const resumed = resumeDraft(saved);
        const selectedContactIds = Array.from(new Set([...resumed.selectedContactIds, ...s.selectedContactIds]));
        return fromDraft({ ...resumed, selectedContactIds });
      }
      return {
        ...initialState,
        step: 'details',
        templateCategory: 'service',
        templateOverrideId: null,
        selectedContactIds: s.selectedContactIds,
      };
    });
  }, []);

  const startAnotherMessage = useCallback(() => {
    setState(() => ({ ...initialState, step: 'template' }));
  }, []);

  const startAgain = useCallback(() => {
    setState((s) => {
      const category = s.templateCategory;
      if (!category) return s;
      return {
        ...initialState,
        step: FIRST_STEP[category] ?? 'details',
        templateCategory: category,
        templateOverrideId: s.templateOverrideId,
      };
    });
  }, []);

  return {
    ...state,
    hasDraftContent: draftHasContent(state),
    startAgain,
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
    markActiveSent,
    markActiveSkipped,
    nextStep,
    prevStep,
    reset,
    restartForServiceDetails,
    startAnotherMessage,
  };
}
