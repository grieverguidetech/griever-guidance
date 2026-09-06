import { useEffect, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSendFlow, useContacts } from '@griever/hooks';
import { TemplatePickerScreen } from '../screens/TemplatePickerScreen';
import { DetailsFormScreen } from '../screens/DetailsFormScreen';
import { ContactSelectorScreen } from '../screens/ContactSelectorScreen';
import { ConfirmScreen } from '../screens/ConfirmScreen';
import { SendingScreen } from '../screens/SendingScreen';
import { SentScreen } from '../screens/SentScreen';
import { mobileContactStore } from '../lib/contactStore';
import { shouldPurgeContacts, recordServiceDate } from '../lib/contactRetention';

export type RootStackParamList = {
  TemplatePicker: undefined;
  DetailsForm: undefined;
  ContactSelector: undefined;
  Confirm: undefined;
  Sending: undefined;
  Sent: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export type FlowProps = { flow: ReturnType<typeof useSendFlow> };

export const App = () => {
  const flow = useSendFlow();
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

  useEffect(() => {
    const serviceDate = flow.fields['serviceDate'];
    if (serviceDate?.trim()) void recordServiceDate(serviceDate);
  }, [flow.fields]);

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
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default App;
