import { configureApiClient } from '@griever/api-client';

// The shared lib can't read `import.meta` (Hermes), so the web app hands it the URL.
configureApiClient({ baseUrl: import.meta.env['VITE_API_URL'] });

if (import.meta.env.PROD && !import.meta.env['VITE_API_URL']) {
  console.error('VITE_API_URL is not set; API calls will go to localhost');
}
