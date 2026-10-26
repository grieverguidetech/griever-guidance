import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NavigationContainer } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSendFlow, useContacts, getContactsRetentionExpiry, latestInProgressDraft, resumeDraft } from '@griever/hooks';
import type { Session, SendFlowDraft } from '@griever/hooks';
import { TemplatePickerScreen } from '../screens/TemplatePickerScreen';
import { DetailsFormScreen } from '../screens/DetailsFormScreen';
import { ContactSelectorScreen } from '../screens/ContactSelectorScreen';
import { ConfirmScreen } from '../screens/ConfirmScreen';
import { SendingScreen } from '../screens/SendingScreen';
import { WhatYoullNeedScreen } from '../screens/WhatYoullNeedScreen';
import { AccountScreen } from '../screens/AccountScreen';
import { AccountProvider, useLaunchState } from '../lib/AccountProvider';
import { AUTH_ENABLED } from '../lib/features';
import { mobileContactStore } from '../lib/contactStore';
import { sendNote } from '../lib/sendNote';
import { createSessionCache, useDeviceSessions } from '../lib/useDeviceSessions';
import { PersonBar } from '../components/PersonSwitcher';
import { HomeScreen } from '../screens/HomeScreen';
import { SetupScreen } from '../screens/SetupScreen';
import { announce } from '../components/authForm';
import { ContactsStepScreen } from '../screens/ContactsStepScreen';
import { useSerifFonts } from '../lib/serifFonts';

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

const Opening = () => (
  <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#ffffff' }}>
    <Text accessibilityLiveRegion="polite">Opening…</Text>
  </View>
);

export type RootStackParamList = {
  Home: undefined;
  TemplatePicker: undefined;
  DetailsForm: undefined;
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
  onDraftChange: (id: string, draft: SendFlowDraft) => void;
  onDetails: (id: string, details: Details) => void;
  onHome: () => void;
  /** The last person has been dealt with: go Home and show this calm line. */
  onFinished: (note: string) => void;
};

// One person's send flow. Keyed by session id in SendApp, so opening another person starts the flow
// from that person's own saved draft and nothing carries over from the previous person.
const SendSession = ({ session, contacts, arrived, onDraftChange, onDetails, onHome, onFinished }: SessionProps) => {
  const { id } = session;
  // The flow opens on the moment changed most recently that is still under way. A finished send
  // keeps no wording (C2), and the next launch opens on a fresh start rather than "sent". A moment
  // left on the picker reopens at its first form, so the picker can't overwrite it (#99, as web).
  const latest = latestInProgressDraft(session);
  const flow = useSendFlow({
    session,
    draft: latest && resumeDraft(latest),
    drafts: session.drafts,
    onDraftChange: useCallback((draft: SendFlowDraft) => onDraftChange(id, draft), [id, onDraftChange]),
  });
  const [pendingArrival, setPendingArrival] = useState(arrived);
  const clearArrival = useCallback(() => setPendingArrival(false), []);

  // What is typed on the details form becomes this person's details, so Home can list
  // them and retention can use the service date. Compared with what was there when the form
  // opened, so opening it (its fields start empty) never wipes the saved name.
  const name = flow.fields['deceasedName'] ?? '';
  const passed = flow.fields['dateOfPassing'] ?? '';
  const service = flow.fields['serviceDate'] ?? '';
  const seen = useRef<Details | null>(null);
  const { setField, selectedTemplate } = flow;
  useEffect(() => {
    if (flow.step !== 'details' && flow.step !== 'announce') {
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
    if (before.serviceDate !== service) changed.serviceDate = service;
    if (Object.keys(changed).length > 0) onDetails(id, changed);
  }, [flow.step, id, name, passed, service, onDetails, session]);

  // The name and date typed at setup are already in the first form when it opens. Once per visit to
  // the form, so clearing a field is never filled back in.
  const onForm = flow.step === 'details' || flow.step === 'announce';
  const prefilled = useRef(false);
  const { personName, dateOfPassing } = session;
  useEffect(() => {
    if (!onForm) {
      prefilled.current = false;
      return;
    }
    if (prefilled.current) return;
    prefilled.current = true;
    const has = (key: string) => selectedTemplate?.fields.some((f) => f.key === key);
    if (!name && personName && has('deceasedName')) setField('deceasedName', personName);
    if (!passed && dateOfPassing && has('dateOfPassing')) setField('dateOfPassing', dateOfPassing);
  }, [onForm, name, passed, personName, dateOfPassing, selectedTemplate, setField]);

  const bar = (
    <PersonBar active={session} onOpen={onHome} arrived={pendingArrival} onArrived={clearArrival} />
  );

  // Done on the last person ends the send. Home keeps no wording of it (C2) and sets no timer.
  const { step, templateCategory, sendJob } = flow;
  const finished = useRef(false);
  useEffect(() => {
    if (step !== 'sent' || finished.current) return;
    finished.current = true;
    onFinished(sendNote(templateCategory, sendJob?.recipients ?? []));
  }, [step, templateCategory, sendJob, onFinished]);

  return <Navigation flow={withoutServiceKnown(flow)} contacts={contacts} bar={bar} />;
};

// The announcement path has a "do you know the service details" step that mobile has no screen
// for. Forward and back step over it, so the flow only ever lands on a screen that exists.
export const withoutServiceKnown = (flow: ReturnType<typeof useSendFlow>): ReturnType<typeof useSendFlow> => ({
  ...flow,
  nextStep: () => {
    flow.nextStep();
    if (flow.step === 'announce' && flow.steps.includes('serviceKnown')) flow.nextStep();
  },
  prevStep: () => {
    flow.prevStep();
    if (flow.step === 'contacts' && flow.steps.includes('serviceKnown')) flow.prevStep();
  },
});

const SendApp = ({ cache }: { cache: ReturnType<typeof createSessionCache> }) => {
  const { sessions, active, switchTo, addPerson, updateDraft, updateSession } = useDeviceSessions(cache);
  const [atHome, setAtHome] = useState(true);
  const [stage, setStage] = useState<SetupStage | null>(null);
  const [arrived, setArrived] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const contacts = useContacts(mobileContactStore);
  const { first, leaveFirst } = useFirstScreen();
  const purgedOnBoot = useRef(false);
  const goHome = useCallback(() => {
    setStage(null);
    setArrived(false);
    setNote(null);
    setAtHome(true);
  }, []);
  const finish = useCallback((text: string) => {
    setArrived(false);
    setNote(text);
    setAtHome(true);
  }, []);

  // Setup is over: open the path. The one place the last setup step hands over (#227 changes this).
  const finishSetup = useCallback(() => {
    setArrived(true);
    setStage(null);
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
    if (expiry && Date.now() > expiry.getTime()) void clearAll();
  }, [contacts.loading, clearAll, sessions]);

  if (!active) return null;
  if (first === 'pending') {
    return <Opening />;
  }
  const open = () => {
    setNote(null);
    setArrived(true);
    setAtHome(false);
  };
  if (atHome) {
    return (
      <HomeNavigation initialRoute={first === 'signIn' ? 'Account' : 'Home'} onLeaveFirst={leaveFirst}>
        {(navigation) => (
          <HomeScreen
            sessions={sessions}
            canCreate
            note={note}
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
            onAccount={AUTH_ENABLED ? () => navigation.navigate('Account') : undefined}
          />
        )}
      </HomeNavigation>
    );
  }
  if (stage === 'checkContacts') {
    return <Opening />;
  }
  if (stage === 'contacts') {
    return (
      <ContactsStepScreen
        key={active.id}
        contacts={contacts}
        onBack={() => setStage('setup')}
        onContinue={finishSetup}
      />
    );
  }
  if (stage === 'setup') {
    return (
      <SetupScreen
        key={active.id}
        initial={{ personName: active.personName, dateOfPassing: active.dateOfPassing ?? '' }}
        onBack={goHome}
        onContinue={(details) => {
          updateSession(active.id, details);
          if (contactsLoading) setStage('checkContacts');
          else afterSetup();
        }}
      />
    );
  }
  return (
    <SendSession
      key={active.id}
      session={active}
      contacts={contacts}
      arrived={arrived}
      onDraftChange={updateDraft}
      onDetails={updateSession}
      onHome={goHome}
      onFinished={finish}
    />
  );
};

type StackNavigation = NativeStackNavigationProp<RootStackParamList>;

// The screens every stack shares: the checklist and, with accounts on, the account.
const sharedScreens = (leaveFirst?: () => void) => (
  <>
    <Stack.Screen name="WhatYoullNeed" options={{ title: '' }}>
      {() => <WhatYoullNeedScreen />}
    </Stack.Screen>
    {AUTH_ENABLED && (
      <Stack.Screen name="Account">
        {({ navigation }) => (
          <AccountScreen
            onBack={() => {
              leaveFirst?.();
              if (navigation.canGoBack()) navigation.goBack();
              else navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
            }}
            // Opened as the first screen: once signed in (and named), land on the normal first screen.
            onSignedIn={
              leaveFirst
                ? () => {
                    leaveFirst();
                    navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
                  }
                : undefined
            }
          />
        )}
      </Stack.Screen>
    )}
  </>
);

const screenOptions = { headerShown: false, contentStyle: { backgroundColor: '#ffffff' } } as const;

const HomeNavigation = ({
  children,
  initialRoute = 'Home',
  onLeaveFirst,
}: {
  children: (navigation: StackNavigation) => ReactNode;
  initialRoute?: 'Home' | 'Account';
  onLeaveFirst?: () => void;
}) => (
  <NavigationContainer>
    <Stack.Navigator screenOptions={screenOptions} initialRouteName={initialRoute}>
      <Stack.Screen name="Home">{({ navigation }) => children(navigation)}</Stack.Screen>
      {sharedScreens(initialRoute === 'Account' ? onLeaveFirst : undefined)}
    </Stack.Navigator>
  </NavigationContainer>
);

// The Home link, the arrival announcement and Android back live on every step, not just the picker.
const withBar = (bar: ReactNode, screen: ReactNode) => (
  <View style={{ flex: 1, backgroundColor: '#ffffff' }}>
    {bar}
    {screen}
  </View>
);

const Navigation = ({
  flow,
  contacts,
  bar,
}: {
  flow: ReturnType<typeof useSendFlow>;
  contacts: ReturnType<typeof useContacts>;
  bar: ReactNode;
}) => {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={screenOptions}>
        {flow.step === 'template' && (
          <Stack.Screen name="TemplatePicker">
            {() => (
              <View style={{ flex: 1, backgroundColor: '#ffffff' }}>
                {bar}
                <TemplatePickerScreen flow={flow} />
              </View>
            )}
          </Stack.Screen>
        )}
        {(flow.step === 'details' || flow.step === 'announce' || flow.step === 'serviceKnown') && (
          <Stack.Screen name="DetailsForm">{() => withBar(bar, <DetailsFormScreen flow={flow} />)}</Stack.Screen>
        )}
        {flow.step === 'contacts' && (
          <Stack.Screen name="ContactSelector">
            {() => withBar(bar, <ContactSelectorScreen flow={flow} contacts={contacts} />)}
          </Stack.Screen>
        )}
        {flow.step === 'review' && (
          <Stack.Screen name="Confirm">{() => withBar(bar, <ConfirmScreen flow={flow} />)}</Stack.Screen>
        )}
        {flow.step === 'sending' && (
          <Stack.Screen name="Sending">{() => <SendingScreen flow={flow} contacts={contacts} />}</Stack.Screen>
        )}
        {flow.step === 'sent' && (
          <Stack.Screen name="Sent">{() => <View style={{ flex: 1, backgroundColor: '#ffffff' }} />}</Stack.Screen>
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
  useSerifFonts();
  return AUTH_ENABLED ? (
    <AccountProvider>
      <SendAppWhenReady />
    </AccountProvider>
  ) : (
    <SendAppWhenReady />
  );
};

export default App;
