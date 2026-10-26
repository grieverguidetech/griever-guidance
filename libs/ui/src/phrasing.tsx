import type { ReactNode } from 'react';

/**
 * Text inside a button must be inline (phrasing) content in HTML. On native there is no HTML, so
 * this does nothing. The web version (phrasing.web.tsx) makes the Text inside it render as a span.
 */
export function Phrasing({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
