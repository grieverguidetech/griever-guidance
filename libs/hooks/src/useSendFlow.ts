import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { templates, composeMessage, firstName, withGreeting } from '@griever/shared';
import type {
  Template,
  TemplateCategory,
  MessageTone,
  RecipientDeliveryStatus,
  SessionDetails,
} from '@griever/shared';

export type SendFlowStep =
  | 'template'
  | 'announce'
  /** Retired: no longer a step. A saved draft on it resumes on 'contacts' (see fromDraft). */
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
  includeFlowers: boolean;
  customFlorist: string;
  flowerDeliveryTarget: 'service' | 'home';
  tone: MessageTone;
  /** Set when the griever hand-edits the wording; pins the draft. */
  messageOverride: string | null;
  /** Start each text with the recipient's first name. On by default; the griever can turn it off. */
  greeting: boolean;
  /** Thank-you only: one optional line per person, by contact id. Never synced (C2). Cleared when the send finishes. */
  recipientNotes: Record<string, string>;
  sendJob: SendJob | null;
}

/** The persisted subset of the flow state (everything but the live send job). */
export type SendFlowDraft = Omit<SendFlowState, 'sendJob'> & {
  /**
   * Contact ids confirmed in the send under way, saved only while the draft is on 'sending'
   * (otherwise empty). A resume drops exactly these, so a re-send to people told before still
   * reaches them. Ids only, local to the device (C2; `drafts` is never synced).
   */
  toldIds: string[];
};

export interface SendFlowActions {
  setTemplateCategory: (category: TemplateCategory) => void;
  setTemplate: (template: Template) => void;
  setField: (key: string, value: string) => void;
  toggleContact: (contactId: string) => void;
  selectContacts: (contactIds: string[]) => void;
  setIncludeFlowers: (value: boolean) => void;
  setCustomFlorist: (value: string) => void;
  setFlowerDeliveryTarget: (target: 'service' | 'home') => void;
  setTone: (tone: MessageTone) => void;
  setMessageOverride: (value: string | null) => void;
  setGreeting: (value: boolean) => void;
  /** Sets or clears (empty text) the line for one person. Only the thank-you adds it to the message. */
  setRecipientNote: (contactId: string, value: string) => void;
  startSendJob: () => void;
  /** The active recipient's own Messages app was opened and (we assume) sent — advance the queue. */
  markActiveSent: () => void;
  /** The griever chose not to text this person right now — advance the queue without marking sent. */
  markActiveSkipped: () => void;
  nextStep: () => void;
  prevStep: () => void;
  reset: () => void;
  /** Ends the send for now. Who was told stays told; the people not yet reached are left out. */
  stopSending: () => void;
  /** Empties this moment's draft and returns to its first form. The person, contacts and sent record are not touched. */
  startAgain: () => void;
}

export interface SendFlowDerived {
  selectedTemplate: Template | null;
  steps: SendFlowStep[];
  session: SessionDetails | null;
  composedFields: Record<string, string>;
  composedMessage: string;
  /**
   * The message for one person: `composedMessage` with their first name on top when `greeting` is on.
   * With a `contactId`, a thank-you also gets that person's note as the last line.
   */
  messageFor: (name: string, contactId?: string) => string;
  /** True when the first form shows something typed, a hand-edited message or (obituary) chosen contacts. */
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
  includeFlowers: false,
  customFlorist: '',
  flowerDeliveryTarget: 'service',
  tone: 'plain',
  messageOverride: null,
  greeting: true,
  recipientNotes: {},
  sendJob: null,
};

/** A fresh draft, for callers that need to hand a session a pre-set starting step (e.g. C4 → C5). */
export function freshDraft(patch: Partial<SendFlowDraft>): SendFlowDraft {
  const { sendJob: _sendJob, ...draft } = initialState;
  return { ...draft, toldIds: [], ...patch };
}

/**
 * True when a saved draft has a message under way (a template chosen, nothing being sent), so
 * reopening the app should put the person back in it rather than start the message over.
 * 'sending' is not resumed by default: the send job isn't saved, and resuming would offer the whole
 * list again. Mobile keeps who was told, so it passes `resumeSending`: a 'sending' draft then
 * reopens on review without the people already told (see fromDraft). 'sent' is finished.
 */
export function hasDraftInProgress(
  draft: SendFlowDraft | null | undefined,
  resumeSending = false,
): draft is SendFlowDraft {
  return (
    !!draft &&
    draft.templateCategory !== null &&
    (draft.step !== 'sending' || resumeSending) &&
    draft.step !== 'sent'
  );
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
export function resumeDraft(draft: SendFlowDraft, skipDetails = false): SendFlowDraft {
  if (draft.step !== 'template') {
    return draft;
  }
  const first = draft.templateCategory ? FIRST_STEP[draft.templateCategory] : undefined;
  return { ...draft, step: first ?? (skipDetails ? 'contacts' : 'details') };
}

/**
 * True when the moment's first form shows something to clear. Typed fields and a hand-edited
 * message count everywhere; chosen contacts count only where the first form is the contacts step
 * (the obituary), so people carried in from elsewhere never make an empty form look written.
 */
export function draftHasContent(
  draft: Pick<SendFlowDraft, 'fields' | 'messageOverride' | 'selectedContactIds' | 'templateCategory'>,
): boolean {
  return (
    Object.values(draft.fields).some((value) => value.trim() !== '') ||
    !!draft.messageOverride ||
    (draft.templateCategory === 'obituary' && draft.selectedContactIds.length > 0)
  );
}

/**
 * True when a moment has something to resume: the first form shows typed words or a hand-edited
 * message, or the draft has moved past that form. A draft only opened (nothing typed) is not started.
 */
export function isDraftStarted(
  draft: SendFlowDraft | null | undefined,
  skipDetails = false,
  resumeSending = false,
): boolean {
  if (!hasDraftInProgress(draft, resumeSending) || !draft.templateCategory) {
    return false;
  }
  const first = FIRST_STEP[draft.templateCategory] ?? (skipDetails ? 'contacts' : 'details');
  return draftHasContent(draft) || (draft.step !== 'template' && draft.step !== first);
}

/** Contact ids already told, per moment, kept on this device. Ids only (C2). */
export type ToldIds = Partial<Record<TemplateCategory, string[]>>;

function fromDraft(draft: SendFlowDraft, skipDetails = false): SendFlowState {
  // Drafts saved before the made-up venue and florist lists were removed carry `place` and
  // `floristId`. Drop them so only the typed place and florist are ever sent.
  const { place: _place, floristId: _floristId, toldIds, ...kept } = draft as SendFlowDraft & {
    place?: unknown;
    floristId?: unknown;
  };
  const restored: SendFlowState = { ...initialState, ...kept, sendJob: null };
  if (restored.step === 'sending') {
    // The send job is not saved, so the whole selection would come back. The people confirmed in
    // this send are dropped from it, so a restart never texts them twice (section 4, Reliability).
    // Only this send's ids count: people told in an earlier send of the moment must hear again.
    const already = new Set(toldIds ?? []);
    const left = restored.selectedContactIds.filter((id) => !already.has(id));
    // Everyone had been told: nothing to review, so it opens on the people.
    restored.step = left.length === 0 && restored.selectedContactIds.length > 0 ? 'contacts' : 'review';
    restored.selectedContactIds = left;
  }
  // The announcement no longer asks whether the service is known (or collects its details on a
  // step of its own); a draft saved on either of those carries on to the people. What was typed
  // stays in `fields` and still reaches the message.
  if (
    restored.step === 'serviceKnown' ||
    (restored.step === 'details' && (restored.templateCategory === 'announcement' || skipDetails))
  ) {
    restored.step = 'contacts';
  }
  return restored;
}

function toDraft(state: SendFlowState): SendFlowDraft {
  const { sendJob, ...draft } = state;
  const toldIds =
    state.step === 'sending' && sendJob
      ? sendJob.recipients.filter((r) => r.status === 'delivered').map((r) => r.contactId)
      : [];
  return { ...draft, toldIds };
}

function loadState(storage: SendFlowStorage | undefined, skipDetails: boolean): SendFlowState {
  if (!storage) return initialState;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return initialState;
    return fromDraft(JSON.parse(raw) as SendFlowDraft, skipDetails);
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

function stepsFor(state: SendFlowState, template: Template | null, skipDetails: boolean): SendFlowStep[] {
  const category = template?.category ?? state.templateCategory;
  if (category === 'announcement') {
    return ['template', 'announce', 'contacts', 'review', 'sending', 'sent'];
  }
  if (category === 'obituary') {
    // The one required field (the link) is gathered on the session in C4,
    // not a per-flow details form — skip straight to recipients.
    return ['template', 'contacts', 'review', 'sending', 'sent'];
  }
  if (skipDetails) {
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

  fields['tone'] = state.tone;
  if (state.templateCategory === 'announcement') {
    // No question is asked: the message carries the service details if the session has them
    // (or a saved draft typed them), and says they will follow otherwise.
    const serviceDate = fields['serviceDate']?.trim() || session?.serviceDate?.trim() || '';
    if (serviceDate) fields['serviceDate'] = serviceDate;
    const known = Boolean(serviceDate || fields['serviceLocation']?.trim());
    fields['serviceDetailsKnown'] = known ? 'yes' : 'no';
  }
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
  /**
   * Leave out the details form: the service and thank-you steps go template, contacts, review,
   * sending, sent, and a saved draft on 'details' resumes on 'contacts'. Mobile sets it (details
   * are edited on the send screen). Off by default, so the web step order is unchanged.
   */
  skipDetails?: boolean;
  /**
   * Set by a caller that keeps who was told (mobile): a draft saved mid-send then resumes, without
   * the people confirmed in that send (the draft's own `toldIds`). Leave unset where nothing is kept.
   */
  told?: ToldIds;
}

export function useSendFlow(
  options: UseSendFlowOptions = {},
): SendFlowState & SendFlowActions & SendFlowDerived {
  const { session = null, draft = null, drafts, onDraftChange, storage, skipDetails = false, told } = options;
  // Only a caller that keeps who was told (mobile) can resume a draft saved mid-send.
  const resumeSending = told !== undefined;
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;

  const [state, setState] = useState<SendFlowState>(() =>
    draft ? fromDraft(draft, skipDetails) : loadState(storage, skipDetails),
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
    () => stepsFor(state, selectedTemplate, skipDetails),
    [state, selectedTemplate, skipDetails],
  );

  const composedFields = useMemo(
    () => buildComposedFields(state, state.customFlorist.trim(), session),
    [state, session],
  );

  // An empty override is the user's own (blank) text, not a reason to fall back to the template.
  const composedMessage =
    state.messageOverride !== null
      ? state.messageOverride
      : composeMessage(selectedTemplate, composedFields);

  const messageFor = useCallback(
    (name: string, contactId?: string) => {
      const greeted = state.greeting ? withGreeting(firstName(name), composedMessage) : composedMessage;
      const note = contactId !== undefined && state.templateCategory === 'aftercare' ? (state.recipientNotes[contactId] ?? '').trim() : '';
      return note === '' ? greeted : `${greeted}\n${note}`;
    },
    [state.greeting, state.templateCategory, state.recipientNotes, composedMessage],
  );

  const setRecipientNote = useCallback((contactId: string, value: string) => {
    setState((s) => ({ ...s, recipientNotes: { ...s.recipientNotes, [contactId]: value } }));
  }, []);

  // A moment already under way comes back as it was, not blank. It stays on the picker step, so
  // the picker's own nextStep lands on the moment's first form with everything typed still there.
  // A draft saved mid-send is the exception: it keeps the step it resumes on (see fromDraft).
  const startedState = useCallback((category: TemplateCategory, templateOverrideId: string | null): SendFlowState => {
    const saved = draftsRef.current?.[category];
    if (hasDraftInProgress(saved, resumeSending) && saved.templateOverrideId === templateOverrideId) {
      const restored = fromDraft(saved, skipDetails);
      // A half-sent moment keeps the step it resumes on (review, or the people if all were told).
      return saved.step === 'sending' ? restored : { ...restored, step: 'template' };
    }
    return { ...initialState, step: 'template', templateCategory: category, templateOverrideId };
  }, [skipDetails, resumeSending]);

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
    setState((s) => ({ ...s, includeFlowers: value }));
  }, []);

  const setCustomFlorist = useCallback((value: string) => {
    setState((s) => ({ ...s, customFlorist: value }));
  }, []);

  const setFlowerDeliveryTarget = useCallback((target: 'service' | 'home') => {
    setState((s) => ({ ...s, flowerDeliveryTarget: target }));
  }, []);

  const setTone = useCallback((tone: MessageTone) => {
    setState((s) => ({ ...s, tone, messageOverride: null }));
  }, []);

  const setMessageOverride = useCallback((value: string | null) => {
    setState((s) => ({ ...s, messageOverride: value }));
  }, []);

  const setGreeting = useCallback((value: boolean) => {
    setState((s) => ({ ...s, greeting: value }));
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
        recipientNotes: allDone ? {} : s.recipientNotes,
      };
    });
  }, []);

  const markActiveSent = useCallback(() => advanceActive('delivered'), [advanceActive]);
  const markActiveSkipped = useCallback(() => advanceActive('skipped'), [advanceActive]);

  const stopSending = useCallback(() => {
    setState((s) => (s.step === 'sending' ? { ...s, step: 'sent', recipientNotes: {} } : s));
  }, []);

  const nextStep = useCallback(() => {
    setState((s) => {
      const order = stepsFor(s, resolveTemplate(s), skipDetails);
      const next = order[order.indexOf(s.step) + 1];
      return next ? { ...s, step: next } : s;
    });
  }, [skipDetails]);

  const prevStep = useCallback(() => {
    setState((s) => {
      const order = stepsFor(s, resolveTemplate(s), skipDetails);
      const prev = order[order.indexOf(s.step) - 1];
      return prev ? { ...s, step: prev } : s;
    });
  }, [skipDetails]);

  const reset = useCallback(() => {
    clearPersisted(storage);
    setState(initialState);
  }, [storage]);

  const startAgain = useCallback(() => {
    setState((s) => {
      const category = s.templateCategory;
      if (!category) return s;
      return {
        ...initialState,
        step: FIRST_STEP[category] ?? (skipDetails ? 'contacts' : 'details'),
        templateCategory: category,
        templateOverrideId: s.templateOverrideId,
        // People chosen elsewhere (e.g. carried in by "Add service details") are not ours to drop.
        // Only the obituary clears them: its first form is the contacts list. With skipDetails the
        // service and thank-you first form is the list too, but its people are kept, so mobile's
        // Start again leaves them ticked.
        selectedContactIds: category === 'obituary' ? [] : s.selectedContactIds,
      };
    });
  }, [skipDetails]);

  return {
    ...state,
    hasDraftContent: draftHasContent(state),
    startAgain,
    selectedTemplate,
    steps,
    session,
    composedFields,
    composedMessage,
    messageFor,
    setRecipientNote,
    setTemplateCategory,
    setTemplate,
    setField,
    toggleContact,
    selectContacts,
    setIncludeFlowers,
    setCustomFlorist,
    setFlowerDeliveryTarget,
    setTone,
    setMessageOverride,
    setGreeting,
    startSendJob,
    markActiveSent,
    markActiveSkipped,
    stopSending,
    nextStep,
    prevStep,
    reset,
  };
}
