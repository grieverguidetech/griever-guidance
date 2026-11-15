import { createBrowserRouter } from 'react-router';
import type { RouteObject } from 'react-router';
import App from '../app/app';
import { NotFound } from './NotFound';
import { SECTIONS } from './paths';

/**
 * Data-mode routes, no loaders. `/`, `/sign-in`, `/sign-up`, `/join` and the editor's person pages
 * all render today's App (one layout route, so moving between them does not remount it); the App
 * reads the editor's spot from the URL. With the editor off, App shows NotFound for the person
 * pages. Anything else is NotFound. Later tickets route the rest of `paths.ts`.
 */
export const routes: RouteObject[] = [
  {
    element: <App />,
    children: [
      { index: true },
      { path: 'sign-in' },
      { path: 'sign-up' },
      { path: 'join' },
      { path: 'people/:flowId' },
      ...SECTIONS.map((section) => ({ path: `people/:flowId/${section}` })),
    ],
  },
  { path: '*', element: <NotFound /> },
];

export function createAppRouter() {
  return createBrowserRouter(routes);
}
