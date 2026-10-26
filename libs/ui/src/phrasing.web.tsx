import type { ReactNode } from 'react';
import TextAncestorContext from 'react-native-web/dist/exports/Text/TextAncestorContext';

/**
 * react-native-web renders a Text as a div unless it sits inside another Text. A div inside a
 * button is invalid HTML, so Text inside a button is told it has a text ancestor and becomes a span.
 * The button is a flex column, so the spans still stack as lines.
 */
export function Phrasing({ children }: { children: ReactNode }) {
  return <TextAncestorContext.Provider value={true}>{children}</TextAncestorContext.Provider>;
}
