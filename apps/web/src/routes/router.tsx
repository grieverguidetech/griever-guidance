import { createBrowserRouter } from 'react-router';
import type { RouteObject } from 'react-router';
import App from '../app/app';
import { NotFound } from './NotFound';
import { SECTIONS } from './paths';

/**
 * Data-mode routes, no loaders. `/`, `/sign-in`, `/sign-up`, `/join` and the editor's person pages
 * all render today's App (one layout route, so moving between them does not remount it); the App
 * reads the editor's spot from the URL (person pages, `/start` and checklist items). With the editor off, App shows NotFound for the person
 * pages. Anything else is NotFound. Later tickets route the rest of `paths.ts`.
 */
export const routes: RouteObject[] = [
  {
    element: <App />,
    // App draws every one of these itself; `element: null` says so, so React Router does not warn about an
    // empty leaf on every render.
    children: [
      { index: true, element: null },
      { path: 'sign-in', element: null },
      { path: 'sign-up', element: null },
      { path: 'join', element: null },
      { path: 'people/:flowId', element: null },
      ...SECTIONS.map((section) => ({ path: `people/:flowId/${section}`, element: null })),
      { path: 'people/:flowId/guide/:itemId', element: null },
      { path: 'start', element: null },
      ...SECTIONS.map((section) => ({ path: `start/${section}`, element: null })),
      { path: 'start/guide/:itemId', element: null },
    ],
  },
  { path: '*', element: <NotFound /> },
];

export function createAppRouter() {
  return createBrowserRouter(routes);
}
