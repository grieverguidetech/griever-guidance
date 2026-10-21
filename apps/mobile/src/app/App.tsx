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
import { AccountProvider } from '../lib/AccountProvider';
import { authClient } from '../lib/authClient';
import { AUTH_ENABLED } from '../lib/features';
import { mobileContactStore } from '../lib/contactStore';
import { sendNote } from '../lib/sendNote';
import { createSessionCache, useDeviceSessions } from '../lib/useDeviceSessions';
import { PersonBar } from '../components/PersonSwitcher';
import { HomeScreen } from '../screens/HomeScreen';
import { SetupScreen } from '../screens/SetupScreen';

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
  const [settingUp, setSettingUp] = useState(false);
  const [arrived, setArrived] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const contacts = useContacts(mobileContactStore);
  const purgedOnBoot = useRef(false);
  const goHome = useCallback(() => {
    setSettingUp(false);
    setArrived(false);
    setNote(null);
    setAtHome(true);
  }, []);
  const finish = useCallback((text: string) => {
    setArrived(false);
    setNote(text);
    setAtHome(true);
  }, []);

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
  const open = () => {
    setNote(null);
    setArrived(true);
    setAtHome(false);
  };
  if (atHome) {
    return (
      <HomeNavigation>
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
              setSettingUp(true);
              setAtHome(false);
            }}
            onAccount={AUTH_ENABLED ? () => navigation.navigate('Account') : undefined}
          />
        )}
      </HomeNavigation>
    );
  }
  if (settingUp) {
    return (
      <SetupScreen
        key={active.id}
        initial={{ personName: active.personName, dateOfPassing: active.dateOfPassing ?? '' }}
        onBack={goHome}
        onContinue={(details) => {
          updateSession(active.id, details);
          setArrived(true);
          setSettingUp(false);
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
const sharedScreens = () => (
  <>
    <Stack.Screen name="WhatYoullNeed" options={{ title: '' }}>
      {() => <WhatYoullNeedScreen />}
    </Stack.Screen>
    {AUTH_ENABLED && (
      <Stack.Screen name="Account">{({ navigation }) => <AccountScreen onBack={navigation.goBack} />}</Stack.Screen>
    )}
  </>
);

const screenOptions = { headerShown: false, contentStyle: { backgroundColor: '#ffffff' } } as const;

const HomeNavigation = ({ children }: { children: (navigation: StackNavigation) => ReactNode }) => (
  <NavigationContainer>
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="Home">{({ navigation }) => children(navigation)}</Stack.Screen>
      {sharedScreens()}
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
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#ffffff' }}>
      <Text accessibilityLiveRegion="polite">Opening…</Text>
    </View>
  );
};

// With the flag off this is exactly the send flow; no account code runs.
export const App = () =>
  AUTH_ENABLED ? (
    <AccountProvider client={authClient}>
      <SendAppWhenReady />
    </AccountProvider>
  ) : (
    <SendAppWhenReady />
  );

export default App;
