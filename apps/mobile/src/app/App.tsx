import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSendFlow } from '@griever/hooks';
import { TemplatePickerScreen } from '../screens/TemplatePickerScreen';
import { DetailsFormScreen } from '../screens/DetailsFormScreen';
import { ContactSelectorScreen } from '../screens/ContactSelectorScreen';
import { ConfirmScreen } from '../screens/ConfirmScreen';
import { SendingScreen } from '../screens/SendingScreen';
import { SentScreen } from '../screens/SentScreen';

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
            {() => <ContactSelectorScreen flow={flow} />}
          </Stack.Screen>
        )}
        {flow.step === 'review' && (
          <Stack.Screen name="Confirm">{() => <ConfirmScreen flow={flow} />}</Stack.Screen>
        )}
        {flow.step === 'sending' && (
          <Stack.Screen name="Sending">{() => <SendingScreen flow={flow} />}</Stack.Screen>
        )}
        {flow.step === 'sent' && (
          <Stack.Screen name="Sent">{() => <SentScreen flow={flow} />}</Stack.Screen>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default App;
