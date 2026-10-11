import { configureApiClient } from '@griever/api-client';

// The shared lib can't read `import.meta` (Hermes), so the web app hands it the URL.
configureApiClient({ baseUrl: import.meta.env['VITE_API_URL'] });
