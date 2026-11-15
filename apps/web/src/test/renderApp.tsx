import type { ReactElement, ReactNode } from 'react';
import { render } from '@testing-library/react';
import type { RenderResult } from '@testing-library/react';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { routes } from '../routes/router';

type RenderAppOptions = { path?: string };

/** The real route table, with the layout route's element swapped for the one under test. */
function routesWith(ui: ReactElement) {
  return routes.map((route, index) => (index === 0 ? { ...route, element: ui } : route));
}

/**
 * Renders `ui` (normally `<App />`) as the layout of the real route table, at `path`.
 * It uses a browser router, so `window.history` (back, forward, pushState) behaves as in the app.
 * Returns the usual RTL result; `rerender` swaps the element and keeps a router at the current URL.
 */
export function renderApp(ui: ReactElement, { path = '/' }: RenderAppOptions = {}): RenderResult {
  if (window.location.pathname !== path) {
    window.history.replaceState(null, '', path);
  }
  const view = (element: ReactElement) => <RouterProvider router={createBrowserRouter(routesWith(element))} />;
  const result = render(view(ui));
  return { ...result, rerender: (next: ReactNode) => result.rerender(view(next as ReactElement)) };
}
