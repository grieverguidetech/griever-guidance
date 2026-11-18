import { createBrowserRouter, Outlet, ScrollRestoration } from 'react-router';
import type { ReactElement } from 'react';
import type { RouteObject } from 'react-router';
import App from '../app/app';
import { captureJoinLink } from '../lib/joinLink';
import { NotFound } from './NotFound';
import { SECTIONS } from './paths';

/**
 * Wraps every route (#852). `<ScrollRestoration/>` sends a new page to the top and puts Back and
 * Forward where they were. It scrolls in a layout effect, before the screens move focus to their h1;
 * those moves use `preventScroll`, so focus never undoes the restored position.
 */
function RouteShell() {
  return (
    <>
      <ScrollRestoration />
      <Outlet />
    </>
  );
}

/**
 * Data-mode routes, no loaders. `/`, `/sign-in`, `/sign-up`, `/join` and the editor's person pages
 * all render today's App (one layout route, so moving between them does not remount it); the App
 * reads the editor's spot from the URL (person pages, `/people`, `/account`, `/start` and checklist items). With the editor off, App shows NotFound for the person
 * pages. Anything else is NotFound. `app` is the App's element, so tests can render the real table
 * around the App they set up.
 */
export function routesWith(app: ReactElement): RouteObject[] {
  return [
    {
      element: <RouteShell />,
      children: [
        {
          element: app,
          // App draws every one of these itself; `element: null` says so, so React Router does not warn about an
          // empty leaf on every render.
          children: [
            { index: true, element: null },
            { path: 'sign-in', element: null },
            // Clerk's own sign-in steps (path routing, #851).
            { path: 'sign-in/*', element: null },
            { path: 'sign-up', element: null },
            { path: 'join', element: null },
            { path: 'people/:flowId', element: null },
            ...SECTIONS.map((section) => ({ path: `people/:flowId/${section}`, element: null })),
            { path: 'people/:flowId/guide/:itemId', element: null },
            { path: 'people', element: null },
            { path: 'account', element: null },
            { path: 'start', element: null },
            ...SECTIONS.map((section) => ({ path: `start/${section}`, element: null })),
            { path: 'start/guide/:itemId', element: null },
          ],
        },
        { path: '*', element: <NotFound /> },
      ],
    },
  ];
}

export const routes: RouteObject[] = routesWith(<App />);

export function createAppRouter() {
  // Before the router reads the URL: an invitation token in `/join#t=` must never reach its state (#128).
  captureJoinLink();
  return createBrowserRouter(routes);
}
