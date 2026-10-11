import './styles.css';
import './lib/configureApi';
import { StrictMode } from 'react';
import * as ReactDOM from 'react-dom/client';
import App from './app/app';
import { registerSync } from './lib/registerSync';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement,
);

root.render(
  <StrictMode>
    <App />
  </StrictMode>,
);

void registerSync();

// Drop the token key left by the old identity system. Runs after sync starts
// so cleanup can never stop it.
try {
  localStorage.removeItem('gg.identity.token.v1');
} catch {
  /* storage blocked; nothing to clean */
}
