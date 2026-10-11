import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSendFlow, useContacts, freshDraft, getContactsRetentionExpiry } from '@griever/hooks';
import type { Session, SendFlowDraft } from '@griever/hooks';
import { TemplatePickerScreen } from '../screens/TemplatePickerScreen';
import { DetailsFormScreen } from '../screens/DetailsFormScreen';
import { ContactSelectorScreen } from '../screens/ContactSelectorScreen';
import { ConfirmScreen } from '../screens/ConfirmScreen';
import { SendingScreen } from '../screens/SendingScreen';
import { SentScreen } from '../screens/SentScreen';
import { WhatYoullNeedScreen } from '../screens/WhatYoullNeedScreen';
import { AccountScreen } from '../screens/AccountScreen';
import { AccountProvider } from '../lib/AccountProvider';
import { authClient } from '../lib/authClient';
import { AUTH_ENABLED } from '../lib/features';
import { mobileContactStore } from '../lib/contactStore';
import { createSessionCache, useDeviceSessions } from '../lib/useDeviceSessions';
import { PersonBar, PersonSwitcher } from '../components/PersonSwitcher';

export type RootStackParamList = {
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
  onOpenSwitcher: () => void;
};

// One person's send flow. Keyed by session id in SendApp, so switching people starts the flow
// from that person's own saved draft and nothing carries over from the previous person.
const SendSession = ({ session, contacts, arrived, onDraftChange, onDetails, onOpenSwitcher }: SessionProps) => {
  const { id } = session;
  // A finished send is not kept as a draft: the person's name and dates live on the session, and
  // the next launch opens on a fresh start rather than on the "sent" screen (C2).
  const saveDraft = useCallback(
    (draft: SendFlowDraft) => onDraftChange(id, draft.step === 'sent' ? freshDraft({}) : draft),
    [id, onDraftChange],
  );
  const flow = useSendFlow({ session, draft: session.draft, onDraftChange: saveDraft });
  const [pendingArrival, setPendingArrival] = useState(arrived);
  const clearArrival = useCallback(() => setPendingArrival(false), []);

  // What is typed on the details form becomes this person's details, so the switcher can list
  // them and retention can use the service date. Compared with what was there when the form
  // opened, so opening it (its fields start empty) never wipes the saved name.
  const name = flow.fields['deceasedName'] ?? '';
  const passed = flow.fields['dateOfPassing'] ?? '';
  const service = flow.fields['serviceDate'] ?? '';
  const seen = useRef<Details | null>(null);
  useEffect(() => {
    if (flow.step !== 'details') {
      seen.current = null;
      return;
    }
    const now = { personName: name, dateOfPassing: passed, serviceDate: service };
    const before = seen.current;
    seen.current = now;
    if (!before) return;
    const changed: Details = {};
    if (before.personName !== name) changed.personName = name;
    if (before.dateOfPassing !== passed) changed.dateOfPassing = passed;
    if (before.serviceDate !== service) changed.serviceDate = service;
    if (Object.keys(changed).length > 0) onDetails(id, changed);
  }, [flow.step, id, name, passed, service, onDetails]);

  const bar = (
    <PersonBar active={session} onOpen={onOpenSwitcher} arrived={pendingArrival} onArrived={clearArrival} />
  );
  return <Navigation flow={flow} contacts={contacts} bar={bar} />;
};

const SendApp = ({ cache }: { cache: ReturnType<typeof createSessionCache> }) => {
  const { sessions, active, switchTo, addPerson, updateDraft, updateSession } = useDeviceSessions(cache);
  const [switching, setSwitching] = useState(false);
  const [arrived, setArrived] = useState(false);
  const contacts = useContacts(mobileContactStore);
  const purgedOnBoot = useRef(false);

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
  const close = () => {
    setArrived(true);
    setSwitching(false);
  };
  if (switching) {
    return (
      <PersonSwitcher
        sessions={sessions}
        activeId={active.id}
        onPick={(id) => {
          switchTo(id);
          close();
        }}
        onAdd={() => {
          addPerson();
          close();
        }}
        onClose={close}
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
      onOpenSwitcher={() => {
        setArrived(false);
        setSwitching(true);
      }}
    />
  );
};

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
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#ffffff' },
        }}
      >
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
        {flow.step === 'details' && (
          <Stack.Screen name="DetailsForm">{() => <DetailsFormScreen flow={flow} />}</Stack.Screen>
        )}
        {flow.step === 'contacts' && (
          <Stack.Screen name="ContactSelector">
            {() => <ContactSelectorScreen flow={flow} contacts={contacts} />}
          </Stack.Screen>
        )}
        {flow.step === 'review' && (
          <Stack.Screen name="Confirm">{() => <ConfirmScreen flow={flow} />}</Stack.Screen>
        )}
        {flow.step === 'sending' && (
          <Stack.Screen name="Sending">{() => <SendingScreen flow={flow} contacts={contacts} />}</Stack.Screen>
        )}
        {flow.step === 'sent' && (
          <Stack.Screen name="Sent">{() => <SentScreen flow={flow} />}</Stack.Screen>
        )}
        <Stack.Screen name="WhatYoullNeed" options={{ title: '' }}>
          {() => <WhatYoullNeedScreen />}
        </Stack.Screen>
        {AUTH_ENABLED && (
          <Stack.Screen name="Account">
            {({ navigation }) => <AccountScreen onBack={navigation.goBack} />}
          </Stack.Screen>
        )}
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
