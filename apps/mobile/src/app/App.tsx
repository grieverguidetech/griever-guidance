import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSendFlow, useContacts } from '@griever/hooks';
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
import { shouldPurgeContacts, recordServiceDate } from '../lib/contactRetention';
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

type SessionProps = {
  session: Session;
  contacts: ReturnType<typeof useContacts>;
  onDraftChange: (id: string, draft: SendFlowDraft) => void;
  onDetails: (id: string, details: { personName: string; dateOfPassing: string }) => void;
  onOpenSwitcher: () => void;
};

// One person's send flow. Keyed by session id in SendApp, so switching people starts the flow
// from that person's own saved draft and nothing carries over from the previous person.
const SendSession = ({ session, contacts, onDraftChange, onDetails, onOpenSwitcher }: SessionProps) => {
  const { id } = session;
  const saveDraft = useCallback((draft: SendFlowDraft) => onDraftChange(id, draft), [id, onDraftChange]);
  const flow = useSendFlow({ session, draft: session.draft, onDraftChange: saveDraft });

  // The name and date typed in the flow become this person's details, so the switcher can list them.
  const name = flow.fields['deceasedName'] ?? '';
  const passed = flow.fields['dateOfPassing'] ?? '';
  useEffect(() => {
    if (name.trim()) onDetails(id, { personName: name, dateOfPassing: passed });
  }, [id, name, passed, onDetails]);

  useEffect(() => {
    const serviceDate = flow.fields['serviceDate'];
    if (serviceDate?.trim()) void recordServiceDate(serviceDate);
  }, [flow.fields]);

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        <Navigation flow={flow} contacts={contacts} />
      </View>
      {flow.step === 'template' && <PersonBar active={session} onOpen={onOpenSwitcher} />}
    </View>
  );
};

const SendApp = ({ cache }: { cache: ReturnType<typeof createSessionCache> }) => {
  const { sessions, active, switchTo, addPerson, updateDraft, updateSession } = useDeviceSessions(cache);
  const [switching, setSwitching] = useState(false);
  const contacts = useContacts(mobileContactStore);
  const purgedOnBoot = useRef(false);

  // Retention: the saved contact list is cleared 30 days past the last known
  // service date (the family may still want it right up until the service
  // is behind them) — see contactRetention.ts for why mobile anchors this to
  // a single stored date rather than useSessions' per-session model.
  const { clearAll } = contacts;
  useEffect(() => {
    if (contacts.loading || purgedOnBoot.current) return;
    purgedOnBoot.current = true;
    void shouldPurgeContacts().then((expired) => {
      if (expired) void clearAll();
    });
  }, [contacts.loading, clearAll]);

  if (!active) return null;
  if (switching) {
    return (
      <PersonSwitcher
        sessions={sessions}
        activeId={active.id}
        onPick={(id) => {
          switchTo(id);
          setSwitching(false);
        }}
        onAdd={() => {
          addPerson();
          setSwitching(false);
        }}
        onClose={() => setSwitching(false)}
      />
    );
  }
  return (
    <SendSession
      key={active.id}
      session={active}
      contacts={contacts}
      onDraftChange={updateDraft}
      onDetails={updateSession}
      onOpenSwitcher={() => setSwitching(true)}
    />
  );
};

const Navigation = ({
  flow,
  contacts,
}: {
  flow: ReturnType<typeof useSendFlow>;
  contacts: ReturnType<typeof useContacts>;
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
          <Stack.Screen name="TemplatePicker">{() => <TemplatePickerScreen flow={flow} />}</Stack.Screen>
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
  return ready ? <SendApp cache={cache} /> : null;
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
