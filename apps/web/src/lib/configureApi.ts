import { configureApiClient } from '@griever/api-client';

const LOCAL_GATEWAY_URL = 'http://localhost:3001';

/** The gateway URL for this build. Shared with the Service Worker setup so the two can't drift. */
export const API_URL: string = import.meta.env['VITE_API_URL'] || LOCAL_GATEWAY_URL;

// The shared lib can't read `import.meta` (Hermes), so the web app hands it the URL.
configureApiClient({ baseUrl: API_URL });

if (import.meta.env.PROD && !import.meta.env['VITE_API_URL']) {
  console.error('VITE_API_URL is not set; API calls will go to localhost');
}
