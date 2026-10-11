import { registerRootComponent } from 'expo';
import { configureApiClient } from '@griever/api-client';

import App from './src/app/App';

// Dot access: Expo only inlines `process.env.EXPO_PUBLIC_*` when it is written this way.
configureApiClient({ baseUrl: process.env.EXPO_PUBLIC_API_URL });

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
