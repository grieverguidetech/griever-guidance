import { registerRootComponent } from 'expo';
import * as SystemUI from 'expo-system-ui';
import { configureApiClient } from '@griever/api-client';
import { v2 } from '@griever/tokens';

import App from './src/app/App';

// Must stay dot access in this file: Expo only inlines `process.env.EXPO_PUBLIC_*` when written this way.
if (!__DEV__ && !process.env.EXPO_PUBLIC_API_URL) {
  console.error('EXPO_PUBLIC_API_URL is not set; API calls will go to localhost');
}
configureApiClient({ baseUrl: process.env.EXPO_PUBLIC_API_URL });

// The root view behind every screen is the page colour, so a moment with nothing drawn is never white (#1073).
// Expo says to call this in the root file, outside a component.
SystemUI.setBackgroundColorAsync(v2.roles.page.color).catch(() => undefined);

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
