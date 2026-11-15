import './styles.css';
import './lib/configureApi';
import { StrictMode } from 'react';
import * as ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { createAppRouter } from './routes/router';
import { unregisterOldWorker } from './lib/unregisterOldWorker';

const router = createAppRouter();

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement,
);

root.render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);

// Drop the token key left by the old identity system.
try {
  localStorage.removeItem('gg.identity.token.v1');
} catch {
  /* storage blocked; nothing to clean */
}

// The old service worker file is gone; remove stale registrations.
void unregisterOldWorker();
