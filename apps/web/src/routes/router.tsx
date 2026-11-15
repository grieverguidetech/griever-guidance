import { createBrowserRouter } from 'react-router';
import type { RouteObject } from 'react-router';
import App from '../app/app';
import { NotFound } from './NotFound';

/**
 * Data-mode routes, no loaders. `/`, `/sign-in` and `/join` all render today's App (one layout
 * route, so moving between them does not remount it); the App still decides what to show.
 * Anything else is NotFound. Later tickets give each screen its own route from `paths.ts`.
 */
export const routes: RouteObject[] = [
  {
    element: <App />,
    children: [{ index: true }, { path: 'sign-in' }, { path: 'join' }],
  },
  { path: '*', element: <NotFound /> },
];

export function createAppRouter() {
  return createBrowserRouter(routes);
}
