import { useCallback, useEffect, useMemo, useState } from 'react';
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
  tickSendJob: () => void;
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
  return ['template', 'details', 'contacts', 'review', 'sent'];
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
  /** Called on every state change so the caller can persist the draft. */
  onDraftChange?: (draft: SendFlowDraft) => void;
  /** Fallback persistence when there is no session (standalone / mobile). */
  storage?: SendFlowStorage;
}

export function useSendFlow(
  options: UseSendFlowOptions = {},
): SendFlowState & SendFlowActions & SendFlowDerived {
  const { session = null, draft = null, onDraftChange, storage } = options;

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

  const startSendJob = useCallback(() => {
    setState((s) => ({
      ...s,
      step: 'sending',
      sendJob: {
        id: `job-${Date.now()}`,
        recipients: s.selectedContactIds.map((contactId) => ({
          contactId,
          status: 'sending' as RecipientDeliveryStatus,
        })),
      },
    }));
  }, []);

  const tickSendJob = useCallback(() => {
    setState((s) => {
      if (!s.sendJob) return s;
      const idx = s.sendJob.recipients.findIndex((r) => r.status === 'sending');
      if (idx === -1) {
        return s.step === 'sending' ? { ...s, step: 'sent' } : s;
      }
      const recipients = s.sendJob.recipients.map((r, i) =>
        i === idx ? { ...r, status: 'delivered' as RecipientDeliveryStatus } : r,
      );
      const allDone = recipients.every((r) => r.status === 'delivered');
      return {
        ...s,
        sendJob: { ...s.sendJob, recipients },
        step: allDone ? 'sent' : s.step,
      };
    });
  }, []);

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
    tickSendJob,
    nextStep,
    prevStep,
    reset,
    restartForServiceDetails,
    startAnotherMessage,
  };
}
