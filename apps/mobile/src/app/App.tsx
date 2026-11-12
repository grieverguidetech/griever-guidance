import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject, ReactNode } from 'react';
import { AccessibilityInfo, BackHandler, Platform, View } from 'react-native';
import { colors } from '@griever/tokens';
import { fill, screenCopy } from '@griever/copy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSendFlow, useContacts, getContactsRetentionExpiry, latestInProgressDraft, resumeDraft } from '@griever/hooks';
import type { Session, SendFlowDraft } from '@griever/hooks';
import { obituaryLink, sendPrefill } from '@griever/shared';
import type { MomentKey, TemplateCategory } from '@griever/shared';
import { ContactSelectorScreen } from '../screens/ContactSelectorScreen';
import { ReadyToSendScreen } from '../screens/ReadyToSendScreen';
import { SendingScreen } from '../screens/SendingScreen';
import { WhatYoullNeedScreen } from '../screens/WhatYoullNeedScreen';
import { AccountScreen } from '../screens/AccountScreen';
import { AccountProvider, useLaunchState } from '../lib/AccountProvider';
import { useAccountSenderName } from '../lib/accountName';
import { AUTH_ENABLED } from '../lib/features';
import { mobileContactStore } from '../lib/contactStore';
import { defaultPicked, startsFresh } from '../lib/defaultRecipients';
import { sendNote } from '../lib/sendNote';
import type { SentNoteText } from '../lib/sendNote';
import { createSessionCache, isBlank, useDeviceSessions } from '../lib/useDeviceSessions';
import { personLabel } from '../components/PersonSwitcher';
import { useMobileFlowSync } from '../lib/useMobileFlowSync';
import { clearPublisherEmails } from '../lib/mailCompose';
import { deleteLocalData, onAccountDeleted } from '../lib/deleteLocalData';
import { AccountDeletedScreen } from '../screens/AccountDeletedScreen';
import { resetUnsavedName } from '../screens/AccountScreen';
import { PersonBar } from '../components/PersonSwitcher';
import { ShareObituaryScreen } from '../screens/ShareObituaryScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { CATEGORY_BY_MOMENT, HubScreen } from '../screens/HubScreen';
import { SetupScreen } from '../screens/SetupScreen';
import { announce } from '../components/authForm';
import { ContactsStepScreen } from '../screens/ContactsStepScreen';
import { SerifReadyContext, SerifText as Text } from '../ui';
import { useSerifFonts } from '../lib/serifFonts';
import { screenTransition } from '../lib/useReduceMotion';
import { useNoFade } from '../lib/useScreenReader';
import { FadeIn, ScreenFrame } from '../components/ScreenFrame';

const switcherCopy = screenCopy('phoneSwitcher');

/** Says who is now open. Queued on iOS so the heading focus does not cut it off; Android waits a moment. */
const announceOpen = (name: string) => {
  const spoken = fill(switcherCopy.nowWriting, { name });
  if (Platform.OS === 'ios') {
    AccessibilityInfo.announceForAccessibilityWithOptions(spoken, { queue: true });
    return;
  }
  setTimeout(() => AccessibilityInfo.announceForAccessibility(spoken), 100);
};

/** The person screen's "Add someone" and Home's start button show only when the user may add a person (C11). */
const CAN_CREATE = true;

/** How long setup waits on the local contacts read before carrying on as if there are none (as web). */
export const CONTACTS_CHECK_FALLBACK_MS = 1500;

/**
 * The steps between Create and the path, in order. A later step (who hears first, #227) is added
 * here and in `afterSetup` below; nothing else in the flow needs to know the order.
 */
type SetupStage = 'setup' | 'checkContacts' | 'contacts';

/**
 * Where the app opens, decided once per launch (as web), from what this device knew when the local
 * cache was read: a signed-in marker opens the normal first screen at once (C5, no network); no
 * marker opens sign-in (the account screen has its own waiting and unavailable states, and Back).
 * Accounts off or unavailable: the normal first screen. A later sign-out never moves the person;
 * only the Sign out button does, on the account screen.
 */
export const useFirstScreen = (): { first: 'pending' | 'home' | 'signIn'; leaveFirst: () => void } => {
  const launch = useLaunchState();
  const [first, setFirst] = useState<'pending' | 'home' | 'signIn'>(AUTH_ENABLED ? 'pending' : 'home');
  const hydrated = launch?.hydrated ?? false;
  const signedIn = launch?.signedIn ?? false;
  useEffect(() => {
    if (first !== 'pending') return;
    if (launch === null) {
      setFirst('home');
    } else if (hydrated) {
      setFirst(signedIn ? 'home' : 'signIn');
    }
  }, [first, launch, hydrated, signedIn]);
  const leaveFirst = useCallback(() => setFirst('home'), []);
  return { first, leaveFirst };
};

/** "Your account" opened from the person screen. Android Back returns to the person screen, as the Back button does. */
const AccountFromHub = ({ onBack }: { onBack: () => void }) => {
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack();
      return true;
    });
    return () => sub.remove();
  }, [onBack]);
  return <AccountScreen onBack={onBack} />;
};

const Opening = () => (
  <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg }}>
    <Text accessibilityLiveRegion="polite" style={{ color: colors.ink }}>Opening…</Text>
  </View>
);

export type RootStackParamList = {
  Home: undefined;
  Starting: undefined;
  ContactSelector: undefined;
  Confirm: undefined;
  Sending: undefined;
  Sent: undefined;
  WhatYoullNeed: undefined;
  Account: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export type FlowProps = { flow: ReturnType<typeof useSendFlow> };

type Details = { personName?: string; dateOfPassing?: string; serviceDate?: string };

type SessionProps = {
  session: Session;
  contacts: ReturnType<typeof useContacts>;
  arrived: boolean;
  /** The step chosen on the hub: the flow opens on that moment's first form, not the picker. */
  startCategory: TemplateCategory | null;
  /** Back from a moment's first form: return to the hub (the picker is gone). */
  onHub: () => void;
  /** Back from the obituary's first form: return to the link screen. */
  onShareObituary: () => void;
  onDraftChange: (id: string, draft: SendFlowDraft) => void;
  onDetails: (id: string, details: Details) => void;
  onHome: () => void;
  /** The last person has been dealt with: go to the hub and show this calm line. */
  onFinished: (note: SentNoteText, sent: SentRecord) => void;
  /** One person was marked sent: write them to this phone now (ids only), before the next hand-off. */
  onTold: (id: string, category: TemplateCategory, contactIds: string[]) => void;
};

/** What a finished send hands up: who it was for, which moment, and the contact ids marked sent (never text). */
type SentRecord = { id: string; category: TemplateCategory | null; deliveredIds: string[] };

/**
 * Steps past the announcement's old intro once per arrival on it. The ref keeps a changed
 * `nextStep` (or a second effect run under StrictMode) from stepping twice; it resets when the
 * step leaves 'announce'.
 */
export const useSkipAnnounce = (onAnnounce: boolean, nextStep: () => void) => {
  const skipped = useRef(false);
  useEffect(() => {
    if (!onAnnounce) {
      skipped.current = false;
      return;
    }
    if (skipped.current) {
      return;
    }
    skipped.current = true;
    nextStep();
  }, [onAnnounce, nextStep]);
};

// One person's send flow. Keyed by session id in SendApp, so opening another person starts the flow
// from that person's own saved draft and nothing carries over from the previous person.
const SendSession = ({ session, contacts, arrived, startCategory, onHub, onShareObituary, onDraftChange, onDetails, onHome, onFinished, onTold }: SessionProps) => {
  const { id } = session;
  // The flow opens on the moment changed most recently that is still under way. A finished send
  // keeps no wording (C2), and the next launch opens on a fresh start rather than "sent". A moment
  // left on the picker reopens at its first form, so the picker can't overwrite it (#99, as web).
  // A draft saved mid-send reopens on review without the people already told.
  const latest = latestInProgressDraft(session, true);
  const flow = useSendFlow({
    session,
    draft: latest && resumeDraft(latest, true),
    // Service and thank-you open on Who should know?; their details are edited on the send screen.
    skipDetails: true,
    // Marks that a draft saved mid-send can resume (it drops the people confirmed in that send).
    // The hub's told count still comes from onTold below.
    told: session.recipientsNotified,
    drafts: session.drafts,
    onDraftChange: useCallback((draft: SendFlowDraft) => onDraftChange(id, draft), [id, onDraftChange]),
  });
  // The hub chose a moment: pick its category, then step past the picker once the flow has it.
  const { setTemplateCategory, setTemplate, nextStep } = flow;
  const [pendingStart, setPendingStart] = useState(startCategory);
  useEffect(() => {
    if (pendingStart && flow.templateCategory !== pendingStart) {
      // The obituary is the share-a-link template, as on web (its draft is kept under that template).
      if (pendingStart === 'obituary') {
        setTemplate(obituaryLink);
      } else {
        setTemplateCategory(pendingStart);
      }
    }
  }, [pendingStart, flow.templateCategory, setTemplateCategory, setTemplate]);
  useEffect(() => {
    if (pendingStart && flow.templateCategory === pendingStart) {
      setPendingStart(null);
      if (flow.step === 'template') {
        nextStep();
      }
    }
  }, [pendingStart, flow.templateCategory, flow.step, nextStep]);
  // The announcement has no intro screen: the flow steps past 'announce' to the people (the same
  // pattern as pendingStart above). A draft saved on 'announce' before this change does the same.
  useSkipAnnounce(flow.step === 'announce', nextStep);
  // The picker is gone. If the flow is ever on it with nothing chosen, go back to the hub rather than stay blank.
  const stuckOnPicker = flow.step === 'template' && !pendingStart;
  useEffect(() => {
    if (stuckOnPicker) {
      onHub();
    }
  }, [stuckOnPicker, onHub]);
  // The obituary's first form is Who should know?; its Back returns to the link screen, not the hub.
  const backToStart = flow.templateCategory === 'obituary' ? onShareObituary : onHub;
  // Chosen from the hub with no draft past the picker: the first arrival on the people picks the defaults.
  // Read once, at mount (the draft saved by opening the moment must not count). A resumed draft never gets them.
  const defaultsPending = useRef(startCategory !== null && startsFresh(session.drafts[startCategory]));
  const [pendingArrival, setPendingArrival] = useState(arrived);
  const clearArrival = useCallback(() => setPendingArrival(false), []);

  // What is typed on the send screen (the service date, the name when setup has none) becomes this
  // person's details, so Home can list them and retention can use the service date. Compared with
  // what was there when the screen opened, so opening it never wipes the saved name. 'announce' is
  // only a pass-through step now; it stays listed so a draft that rests there behaves as before.
  const name = flow.fields['deceasedName'] ?? '';
  const passed = flow.fields['dateOfPassing'] ?? '';
  const service = flow.fields['serviceDate'] ?? '';
  const seen = useRef<Details | null>(null);
  const { setField, selectedTemplate } = flow;
  useEffect(() => {
    if (flow.step !== 'announce' && flow.step !== 'review') {
      seen.current = null;
      return;
    }
    const now = { personName: name, dateOfPassing: passed, serviceDate: service };
    const before = seen.current;
    seen.current = now;
    if (!before) return;
    const changed: Details = {};
    if (before.personName !== name && name !== session.personName) changed.personName = name;
    if (before.dateOfPassing !== passed && passed !== session.dateOfPassing) changed.dateOfPassing = passed;
    // Equal to the saved value (a prefill) is not a change, so opening the form never re-writes it.
    if (before.serviceDate !== service && service !== session.serviceDate) changed.serviceDate = service;
    if (Object.keys(changed).length > 0) onDetails(id, changed);
  }, [flow.step, id, name, passed, service, onDetails, session]);

  // The name and date typed at setup are already in the first form when it opens. Once per visit to
  // the form, so clearing a field is never filled back in.
  // For every other moment the first form is Who should know? (the contacts step), so it counts as a form too.
  const onForm =
    flow.step === 'announce' ||
    (flow.step === 'contacts' &&
      (flow.templateCategory === 'announcement' ||
        flow.templateCategory === 'obituary' ||
        flow.templateCategory === 'service' ||
        flow.templateCategory === 'aftercare'));
  // One prefill per visit to the form. The visit lasts while the step moves between the people sheet
  // ('contacts') and Ready to send ('review'), so opening the sheet with Change never re-runs it and
  // never throws away wording the family edited by hand.
  const inVisit = onForm || flow.step === 'review';
  const prefilled = useRef(false);
  const { personName, dateOfPassing } = session;
  // The signed-in account's name, for the thank-you's sender field. On-device only (DS-7).
  const accountName = useAccountSenderName();
  const senderTyped = flow.fields['senderName'] ?? '';
  const { hasDraftContent, setMessageOverride, templateCategory: category, messageOverride } = flow;
  useEffect(() => {
    if (!inVisit) {
      prefilled.current = false;
      return;
    }
    if (prefilled.current) return;
    prefilled.current = true;
    const has = (key: string) => selectedTemplate?.fields.some((f) => f.key === key);
    // The account name starts the sender field when the person has none and nothing is typed. Never
    // over a typed name, and never when the family hand-edited the message: setField clears the
    // override, so that wording would be lost. Runs before setMessageOverride below,
    // and also for a draft resumed on Ready to send (the hub counts the account name, so that screen
    // must not block on it). Once per visit: a profile that arrives later does not fill, on purpose,
    // so a name never appears under a family that has started typing.
    if (accountName && !senderTyped && !session.senderName && messageOverride === null && has('senderName')) {
      setField('senderName', accountName);
    }
    // A draft resumed straight on Ready to send is not a first-form arrival: nothing else to prefill.
    if (!onForm) return;
    // Older drafts saved obituaryText as the message. The obituary send texts the link template now
    // (MOB-9, #559 Decision 4), so drop that copy; a hand-edited message stays.
    if (category === 'obituary' && messageOverride && messageOverride === session.obituaryText) {
      setMessageOverride(null);
    }
    const fresh = !hasDraftContent && messageOverride === null;
    if (!name && personName && has('deceasedName')) setField('deceasedName', personName);
    if (!passed && dateOfPassing && has('dateOfPassing')) setField('dateOfPassing', dateOfPassing);
    // The planned details and edited wording (synced from the web) start a fresh form. A form with
    // anything typed, or a hand-edited message (even an empty one), is never touched. setField
    // clears the override, so every field is set first and the override is the last call.
    if (fresh && category) {
      const planned = sendPrefill(session, category);
      for (const [key, value] of Object.entries(planned.fields)) {
        if (has(key)) {
          setField(key, value);
        }
      }
      // Kept untrimmed on purpose: it is the family's own wording, and '' is a real choice.
      if (planned.messageOverride !== null) {
        setMessageOverride(planned.messageOverride);
      }
    }
  }, [inVisit, onForm, name, passed, personName, dateOfPassing, selectedTemplate, setField, setMessageOverride, hasDraftContent, messageOverride, category, session, accountName, senderTyped]);

  // On a moment's first form, Back (on screen and Android's) returns to the hub.
  // The announcement's first form is the people step (its intro is skipped), so Back there must not
  // step onto 'announce', which would bounce straight back into the flow.
  const onFirstForm =
    flow.steps[flow.steps.indexOf(flow.step) - 1] === 'template' ||
    (flow.templateCategory === 'announcement' && flow.step === 'contacts');

  // Done on the last person ends the send. The hub keeps no wording of it (C2) and sets no timer.
  const { step, templateCategory, sendJob } = flow;
  const finished = useRef(false);
  useEffect(() => {
    if (step !== 'sent' || finished.current) return;
    finished.current = true;
    const recipients = sendJob?.recipients ?? [];
    // Only contact ids go up to the hub, never the message text (C2).
    const deliveredIds = recipients.filter((r) => r.status === 'delivered').map((r) => r.contactId);
    onFinished(sendNote(templateCategory, recipients), { id, category: templateCategory, deliveredIds });
  }, [step, templateCategory, sendJob, onFinished]);

  // Each confirmed person is written to the phone right after each confirm (this effect runs when
  // the send job changes), so a force-quit mid-send never forgets who was told. Read from the send
  // job itself, not from a render's closure, so two quick taps record the right two people.
  // Repeats merge. Ids only (C2).
  useEffect(() => {
    if (!templateCategory || !sendJob) {
      return;
    }
    const delivered = sendJob.recipients.filter((r) => r.status === 'delivered').map((r) => r.contactId);
    if (delivered.length > 0) {
      onTold(id, templateCategory, delivered);
    }
  }, [sendJob, templateCategory, id, onTold]);

  // The people sheet is open on 'contacts'. Arriving there from the person screen must not open it:
  // step on to Ready to send, once per arrival. The sheet opened by Change is left alone.
  const sheetAsked = useRef(false);
  const arrivalHandled = useRef(false);
  const onPeople = useRef(false);
  // State, not only the ref, so the render sees it: the sheet's Modal must never be visible on an
  // arrival the user did not ask for, even for one render (#691: iOS keeps a stuck invisible window).
  const [peopleAsked, setPeopleAsked] = useState(false);
  const choosePeople = useCallback(() => {
    sheetAsked.current = true;
    setPeopleAsked(true);
    flow.prevStep();
  }, [flow.prevStep]);
  useEffect(() => {
    if (flow.step !== 'contacts') {
      sheetAsked.current = false;
      setPeopleAsked(false);
      arrivalHandled.current = false;
      // Defaults apply at the first arrival or never: leaving the people once closes the chance.
      if (onPeople.current) {
        defaultsPending.current = false;
      }
      return;
    }
    onPeople.current = true;
    if (sheetAsked.current || arrivalHandled.current) {
      return;
    }
    const category = flow.templateCategory;
    if (defaultsPending.current && category) {
      // The saved people are read from the phone; wait for them, so the defaults are not missed.
      if (contacts.loading) {
        return;
      }
      defaultsPending.current = false;
      flow.selectContacts(defaultPicked(category, session.recipientsNotified, contacts.contacts.map((c) => c.contactId)));
    }
    arrivalHandled.current = true;
    nextStep();
  }, [flow.step, flow.templateCategory, flow.selectContacts, nextStep, contacts.loading, contacts.contacts, session.recipientsNotified]);

  const flowWithHub = {
    ...flow,
    prevStep: () => {
      // A safety net. A visible Modal takes Android Back through its onRequestClose, so this only runs if
      // Back reaches the bar with the sheet open; then it closes the sheet and nothing else.
      if (flow.step === 'contacts') {
        flow.nextStep();
        return;
      }
      // The step before this one is the picker: go to the hub instead. Ready to send also goes
      // straight back to the person screen (the obituary: its link screen); "Change" is the way to the people.
      if (onFirstForm || flow.step === 'review') {
        backToStart();
      } else {
        flow.prevStep();
      }
    },
  };
  // Android's Back does what the Back on the screen does, one step at a time. While sending, the
  // on-screen way out is "Stop for now", so Back leaves to the hub (the job is kept).
  // Lets the sheet's onDismiss (iOS) send focus to the button on Ready to send that opened it.
  const focusPeopleButton = useRef<(() => void) | null>(null);
  const bar = (
    <PersonBar
      active={session}
      onOpen={onHome}
      onHardwareBack={flow.step === 'sending' ? onHub : flowWithHub.prevStep}
      arrived={pendingArrival}
      onArrived={clearArrival}
    />
  );
  return <Navigation flow={flowWithHub} contacts={contacts} bar={bar} onChoosePeople={choosePeople} onGotIt={onHub} peopleAsked={peopleAsked} notified={session.recipientsNotified} focusPeopleButton={focusPeopleButton} />;
};

const SendApp = ({ cache }: { cache: ReturnType<typeof createSessionCache> }) => {
  const { sessions, active, lastOpened, switchTo, addPerson, updateDraft, updateSession, setChecklistItem, applyRemoteFlows, recordMomentComplete, recordObituaryEmailed } = useDeviceSessions(cache);
  // Background sync; does nothing unless accounts and sync are both on and someone is signed in.
  useMobileFlowSync({ sessions, applyRemoteFlows, storage: cache });
  // A launch opens the last person's screen (the hub), unless they are still blank. Decided once,
  // from the device cache SendAppWhenReady already read: nothing waits on the network.
  const [resume] = useState(() => lastOpened !== null && !isBlank(lastOpened));
  const [atHome, setAtHome] = useState(!resume);
  const [stage, setStage] = useState<SetupStage | null>(null);
  const [arrived, setArrived] = useState(resume);
  const [atHub, setAtHub] = useState(resume);
  const [atShareObituary, setAtShareObituary] = useState(false);
  // Setup was opened with Edit, from a step or from the hub: Back there returns to where it was opened, as on web.
  const [editFrom, setEditFrom] = useState<'hub' | null>(null);
  const [startCategory, setStartCategory] = useState<TemplateCategory | null>(null);
  const [note, setNote] = useState<SentNoteText | null>(null);
  // Importing device contacts from Home; on return Home puts focus back on the import button.
  const [importing, setImporting] = useState(false);
  const [backFromImport, setBackFromImport] = useState(false);
  // "Your account" opened from the person screen (Home has its own route to it).
  const [atAccount, setAtAccount] = useState(false);
  // The person who was open when "Add someone" was pressed, so Back from setup returns to them.
  const [addedFrom, setAddedFrom] = useState<string | null>(null);
  const contacts = useContacts(mobileContactStore);
  const { first, leaveFirst } = useFirstScreen();
  const purgedOnBoot = useRef(false);
  // Sign-in comes first: Home hosts it, so a signed-out launch starts there, not on the person.
  useEffect(() => {
    if (first === 'signIn') {
      setAtHome(true);
    }
  }, [first]);
  // A resumed launch says who is open once, from the hub (the person bar is not mounted there yet).
  // It is queued on iOS so the heading focus does not cut it off; Android waits a moment, as the hub's
  // note does. Then the arrival is spent, so the first moment does not say it again.
  const announcedResume = useRef(false);
  const resumedName = lastOpened ? personLabel(lastOpened) : '';
  useEffect(() => {
    if (!resume || announcedResume.current || first === 'pending') {
      return;
    }
    if (first === 'signIn') {
      announcedResume.current = true; // sign-in came first: this launch lands on Home, so nothing is said
      return;
    }
    announcedResume.current = true;
    setArrived(false);
    announceOpen(resumedName);
  }, [resume, first, resumedName]);
  const goHome = useCallback(() => {
    setStage(null);
    setEditFrom(null);
    setArrived(false);
    setAtHub(false);
    setAtShareObituary(false);
    setStartCategory(null);
    setNote(null);
    setBackFromImport(false);
    setAddedFrom(null);
    setAtHome(true);
  }, []);
  const finish = useCallback(
    (text: SentNoteText, sent: SentRecord) => {
      // An all-skipped send records nothing. The record stays on this phone (recipientsNotified is never synced).
      if (sent.category && sent.deliveredIds.length > 0) {
        recordMomentComplete(sent.id, sent.category, sent.deliveredIds);
      }
      setArrived(false);
      setAtHub(true);
      setStartCategory(null);
      setNote(text);
      setBackFromImport(false);
      setAtHome(false);
    },
    [recordMomentComplete],
  );

  // Setup is over: open the path. The one place the last setup step hands over (#227 changes this).
  const finishSetup = useCallback(() => {
    setArrived(true);
    setStartCategory(null);
    setAtHub(true);
    setStage(null);
    setAddedFrom(null);
  }, []);

  // Contacts are asked for only when this phone has none. The check reads the local store only.
  const { loading: contactsLoading, contacts: saved } = contacts;
  const hasContacts = saved.length > 0;
  const afterSetup = useCallback(() => {
    if (hasContacts) finishSetup();
    else setStage('contacts');
  }, [hasContacts, finishSetup]);
  useEffect(() => {
    if (stage === 'checkContacts' && !contactsLoading) afterSetup();
  }, [stage, contactsLoading, afterSetup]);
  // If the local read never answers, carry on as if there are no contacts (C5: nothing waits).
  useEffect(() => {
    if (stage !== 'checkContacts') return;
    announce('Opening…'); // iOS only; Android reads the live region on the screen
    const timer = setTimeout(() => setStage('contacts'), CONTACTS_CHECK_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [stage]);

  // Retention: the saved contact list is cleared 30 days past the latest service date across
  // everyone kept here (the family may still want it right up until the services are behind them).
  // TODO(#79): getContactsRetentionExpiry becomes strict about complete dates there.
  const { clearAll } = contacts;
  useEffect(() => {
    if (contacts.loading || purgedOnBoot.current) return;
    purgedOnBoot.current = true;
    const expiry = getContactsRetentionExpiry(sessions);
    if (expiry && Date.now() > expiry.getTime()) {
      void clearAll();
      // The publisher's email is kept per person on this phone (MOB-9); it goes with the contacts.
      void clearPublisherEmails(sessions.map((s) => s.id));
    }
  }, [contacts.loading, clearAll, sessions]);

  // A person that sync removes from this phone takes their saved publisher email with them.
  const knownPeople = useRef<string[] | null>(null);
  useEffect(() => {
    const ids = sessions.map((s) => s.id);
    const before = knownPeople.current;
    knownPeople.current = ids;
    const gone = before ? before.filter((id) => !ids.includes(id)) : [];
    if (gone.length > 0) {
      void clearPublisherEmails(gone);
    }
  }, [sessions]);

  if (!active) return null;
  if (first === 'pending') {
    return <Opening />;
  }
  const open = () => {
    setNote(null);
    setBackFromImport(false);
    setArrived(true);
    setStartCategory(null);
    setAtHub(true);
    setAtHome(false);
  };
  const showHome = atHome || first === 'signIn';
  if (importing) {
    const leaveImport = () => {
      leaveFirst();
      // Home puts focus back on its import button; the person screen is drawn fresh and takes focus on its heading.
      setBackFromImport(showHome);
      setImporting(false);
    };
    return (
      <FadeIn key="import">
        <ScreenFrame>
          <ContactsStepScreen contacts={contacts} onBack={leaveImport} onContinue={leaveImport} startWithImport />
        </ScreenFrame>
      </FadeIn>
    );
  }
  if (showHome) {
    return (
      <FadeIn key="home">
        <HomeNavigation initialRoute={first === 'signIn' ? 'Account' : 'Home'} onLeaveFirst={leaveFirst}>
          {(navigation) => (
            <HomeScreen
              sessions={sessions}
              canCreate={CAN_CREATE}
              onOpen={(id) => {
                switchTo(id);
                open();
              }}
              onCreate={() => {
                addPerson();
                setNote(null);
                setStage('setup');
                setAtHome(false);
              }}
              onWhatYoullNeed={AUTH_ENABLED ? undefined : () => navigation.navigate('WhatYoullNeed')}
              onImportContacts={() => {
                // Leaving Home for the import ends the note, so it is not read again on return.
                setNote(null);
                setBackFromImport(false);
                setImporting(true);
              }}
              focusImport={backFromImport}
              onAccount={AUTH_ENABLED ? () => navigation.navigate('Account') : undefined}
            />
          )}
        </HomeNavigation>
      </FadeIn>
    );
  }
  if (atAccount) {
    return (
      <FadeIn key="account">
        <ScreenFrame>
          <AccountFromHub onBack={() => setAtAccount(false)} />
        </ScreenFrame>
      </FadeIn>
    );
  }
  if (stage === 'checkContacts') {
    return <Opening />;
  }
  if (stage === 'contacts') {
    return (
      <FadeIn key="contacts">
        <ScreenFrame>
          <ContactsStepScreen
            key={active.id}
            contacts={contacts}
            onBack={() => setStage('setup')}
            onContinue={finishSetup}
          />
        </ScreenFrame>
      </FadeIn>
    );
  }
  if (stage === 'setup') {
    // Edit returns to where it was pressed (a step or the hub), for Back and for Continue alike.
    const leaveEdit = () => {
      setAtHub(editFrom === 'hub');
      setEditFrom(null);
      setStage(null);
    };
    // Back from a person added from the person screen returns to the person who was open; from Home it returns to Home.
    const leaveAdd = () => {
      if (!addedFrom) {
        goHome();
        return;
      }
      switchTo(addedFrom);
      setAddedFrom(null);
      setStage(null);
      setAtHub(true);
    };
    return (
      <FadeIn key="setup">
        <ScreenFrame>
          <SetupScreen
            key={active.id}
            initial={{ personName: active.personName, dateOfPassing: active.dateOfPassing ?? '', birthDate: active.birthDate ?? '' }}
            checklist={active.checklist}
            onSetItem={(itemId, state) => setChecklistItem(active.id, itemId, state)}
            returnsToPlace={editFrom !== null}
            onBack={editFrom ? leaveEdit : leaveAdd}
            onContinue={(details) => {
              updateSession(active.id, details);
              if (editFrom) {
                // The person is already set up and has been through the contacts check: skip it.
                leaveEdit();
                return;
              }
              if (contactsLoading) {
                setStage('checkContacts');
              } else {
                afterSetup();
              }
            }}
          />
        </ScreenFrame>
      </FadeIn>
    );
  }
  if (atShareObituary) {
    return (
      <FadeIn key="obituary">
        <ScreenFrame bottomInset={false}>
          <ShareObituaryScreen
            key={active.id}
            session={active}
            onChange={(patch) => updateSession(active.id, patch)}
            onSetItem={(itemId, state) => setChecklistItem(active.id, itemId, state)}
            onBack={() => {
              setAtShareObituary(false);
              setAtHub(true);
            }}
            onContinue={() => {
              setStartCategory('obituary');
              setAtShareObituary(false);
            }}
            onEmailed={() => {
              // Emailing it marks the obituary done, before the link is texted. The hub's heading takes focus.
              recordObituaryEmailed(active.id);
              setNote(null);
              setAtShareObituary(false);
              setAtHub(true);
            }}
          />
        </ScreenFrame>
      </FadeIn>
    );
  }
  if (atHub) {
    return (
      <FadeIn key="hub">
        <ScreenFrame bottomInset={false}>
          <HubScreen
            key={active.id}
            session={active}
            note={note}
            others={sessions.filter((s) => s.id !== active.id && !isBlank(s))}
            onSwitch={(id) => {
              const picked = sessions.find((s) => s.id === id);
              if (!picked) {
                return;
              }
              switchTo(id);
              setNote(null);
              setArrived(false);
              announceOpen(personLabel(picked));
            }}
            onAddSomeone={
              CAN_CREATE
                ? () => {
                    setAddedFrom(active.id);
                    addPerson();
                    setNote(null);
                    setAtHub(false);
                    setStage('setup');
                  }
                : undefined
            }
            onAccount={AUTH_ENABLED ? () => setAtAccount(true) : undefined}
            onSetItem={(itemId, state) => setChecklistItem(active.id, itemId, state)}
            onStart={(key: MomentKey) => {
              setNote(null);
              setAtHub(false);
              if (key === 'obituary') {
                // The link comes first (C10 allows it here, never at setup); then Who should know?.
                setAtShareObituary(true);
              } else {
                setStartCategory(CATEGORY_BY_MOMENT[key]);
              }
            }}
            onEditPerson={() => {
              setNote(null);
              setAtHub(false);
              setEditFrom('hub');
              setStage('setup');
            }}
          />
        </ScreenFrame>
      </FadeIn>
    );
  }
  return (
    <FadeIn key="flow">
      <SendSession
        key={active.id}
        session={active}
        contacts={contacts}
        arrived={arrived}
        startCategory={startCategory}
        onHub={() => setAtHub(true)}
        onShareObituary={() => setAtShareObituary(true)}
        onDraftChange={updateDraft}
        onDetails={updateSession}
        onHome={goHome}
        onFinished={finish}
        onTold={recordMomentComplete}
      />
    </FadeIn>
  );
};

type StackNavigation = NativeStackNavigationProp<RootStackParamList>;

// The screens every stack shares: the checklist and, with accounts on, the account.
const sharedScreens = (leaveFirst?: () => void) => (
  <>
    <Stack.Screen name="WhatYoullNeed" options={{ title: '' }}>
      {() => (
        <ScreenFrame>
          <WhatYoullNeedScreen />
        </ScreenFrame>
      )}
    </Stack.Screen>
    {AUTH_ENABLED && (
      <Stack.Screen name="Account">
        {({ navigation }) => (
          <ScreenFrame>
            <AccountScreen
              onBack={() => {
                leaveFirst?.();
                if (navigation.canGoBack()) navigation.goBack();
                else navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
              }}
              // Opened as the first screen: once signed in and the profile has answered, land on the normal first screen.
              onSignedIn={
                leaveFirst
                  ? () => {
                      leaveFirst();
                      navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
                    }
                  : undefined
              }
            />
          </ScreenFrame>
        )}
      </Stack.Screen>
    )}
  </>
);

// One calm fade between screens, none with Reduce Motion or a screen reader on. The page colour shows between screens.
const useScreenOptions = () => {
  const noFade = useNoFade();
  return useMemo(() => ({ headerShown: false, contentStyle: { backgroundColor: colors.bg }, ...screenTransition(noFade) }), [noFade]);
};

const HomeNavigation = ({
  children,
  initialRoute = 'Home',
  onLeaveFirst,
}: {
  children: (navigation: StackNavigation) => ReactNode;
  initialRoute?: 'Home' | 'Account';
  onLeaveFirst?: () => void;
}) => {
  const screenOptions = useScreenOptions();
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={screenOptions} initialRouteName={initialRoute}>
        <Stack.Screen name="Home">{({ navigation }) => <ScreenFrame>{children(navigation)}</ScreenFrame>}</Stack.Screen>
        {sharedScreens(initialRoute === 'Account' ? onLeaveFirst : undefined)}
      </Stack.Navigator>
    </NavigationContainer>
  );
};

// The person bar draws nothing now; it still carries Android back and the arrival announcement on
// every step. This wrapper gives the step the shared safe-area frame.
const PersonContext = ({ bar, children, bottomInset }: { bar: ReactNode; children: ReactNode; bottomInset: boolean }) => (
  <ScreenFrame bottomInset={bottomInset}>
    {bar}
    {children}
  </ScreenFrame>
);
// A screen with its own bottom bar (Sending) pads by the inset itself, so the frame must not.
const withPersonContext = (bar: ReactNode, screen: ReactNode, bottomInset = true) => (
  <PersonContext bar={bar} bottomInset={bottomInset}>
    {screen}
  </PersonContext>
);

const Navigation = ({
  flow,
  contacts,
  bar,
  onChoosePeople,
  onGotIt,
  peopleAsked,
  notified,
  focusPeopleButton,
}: {
  flow: ReturnType<typeof useSendFlow>;
  contacts: ReturnType<typeof useContacts>;
  bar: ReactNode;
  onChoosePeople: () => void;
  /** The nudge's Got it: the hub, even while the people step is still open under it. */
  onGotIt: () => void;
  peopleAsked: boolean;
  notified: Session['recipientsNotified'];
  focusPeopleButton?: MutableRefObject<(() => void) | null>;
}) => {
  const screenOptions = useScreenOptions();
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={screenOptions}>
        {(flow.step === 'template' || flow.step === 'announce') && (
          // Only for the moment between choosing a step on the hub and its first form opening
          // (the announcement passes through 'announce' on the way).
          <Stack.Screen name="Starting">{() => <Opening />}</Stack.Screen>
        )}
        {(flow.step === 'contacts' || flow.step === 'review') && (
          // One route for both steps: the people list is a sheet over Ready to send, open on 'contacts'.
          <Stack.Screen name="Confirm">
            {() =>
              withPersonContext(
                bar,
                <>
                  <ReadyToSendScreen flow={flow} contacts={contacts} onChoosePeople={onChoosePeople} onGotIt={onGotIt} focusPeopleButton={focusPeopleButton} />
                  <ContactSelectorScreen
                    flow={flow}
                    contacts={contacts}
                    notified={notified}
                    open={flow.step === 'contacts' && peopleAsked}
                    onDismiss={() => focusPeopleButton?.current?.()}
                  />
                </>,
                false,
              )
            }
          </Stack.Screen>
        )}
        {flow.step === 'sending' && (
          <Stack.Screen name="Sending">
            {() => withPersonContext(bar, <SendingScreen flow={flow} contacts={contacts} />, false)}
          </Stack.Screen>
        )}
        {flow.step === 'sent' && (
          <Stack.Screen name="Sent">{() => <Opening />}</Stack.Screen>
        )}
        {sharedScreens()}
      </Stack.Navigator>
    </NavigationContainer>
  );
};

// People are read from the phone before anything shows, so a relaunch never flashes an empty start.
const SendAppWhenReady = () => {
  const [cache] = useState(createSessionCache);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    void cache.hydrate().then(() => setReady(true));
    // One-time cleanup of the old single service date, replaced by per-person sessions (#20).
    void AsyncStorage.removeItem('gg.serviceDate.v1').catch(() => undefined);
  }, [cache]);
  return ready ? (
    <SendApp cache={cache} />
  ) : (
    <Opening />
  );
};

// With the flag off this is exactly the send flow; no account code runs.
export const App = () => {
  const fontsSettled = useSerifFonts();
  // After the account is deleted, everything held in memory (people, contacts, caches, a name typed at sign-up) is dropped at once:
  // the deleted screen stands in place of the send flow until the person leaves it, and the send flow then mounts again from an empty phone.
  // Every way out of that screen (its button, Android Back) then lands on a clean first screen.
  // `cleared` is null while this phone is being cleared.
  const [deleted, setDeleted] = useState<{ cleared: boolean | null } | null>(null);
  useEffect(
    () =>
      onAccountDeleted(() => {
        resetUnsavedName();
        setDeleted({ cleared: null });
      }),
    [],
  );
  // The sweep starts after the send flow has unmounted (effects run after the commit), so no write from it can land afterwards.
  const clearing = deleted !== null && deleted.cleared === null;
  useEffect(() => {
    if (!clearing) {
      return;
    }
    let live = true;
    void deleteLocalData().then((cleared) => {
      if (live) {
        setDeleted({ cleared });
      }
    });
    return () => {
      live = false;
    };
  }, [clearing]);
  const leaveDeleted = useCallback(() => setDeleted(null), []);
  const content = deleted ? (
    <ScreenFrame>
      <View style={{ flex: 1, padding: 24, paddingTop: 20 }}>
        <AccountDeletedScreen cleared={deleted.cleared} onDone={leaveDeleted} />
      </View>
    </ScreenFrame>
  ) : (
    <SendAppWhenReady />
  );
  // Mobile UI components (apps/mobile/src/ui) switch from the system font to the serif when it arrives.
  return (
    <SafeAreaProvider>
      <SerifReadyContext.Provider value={fontsSettled}>
        {AUTH_ENABLED ? (
          <AccountProvider>{content}</AccountProvider>
        ) : (
          content
        )}
      </SerifReadyContext.Provider>
    </SafeAreaProvider>
  );
};

export default App;
