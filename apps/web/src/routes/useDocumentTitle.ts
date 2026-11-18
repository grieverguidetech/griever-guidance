/**
 * The browser tab title (#852). One generic title per route, taken from the path alone. A path only
 * ever holds ids (see paths.ts), and the words come from libs/copy with no placeholders, so a title
 * can never hold a person's name: the tab, the history menu and a shared screen stay private.
 */
import { useEffect } from 'react';
import { screenCopy } from '@griever/copy';
import { parsePath } from './paths';
import type { Section } from './paths';

const titles = screenCopy('routeTitles');
const notFoundTitle = screenCopy('notFound').title;

const SECTION_TITLES: Record<Section, string> = {
  person: titles.person,
  announcement: titles.announcement,
  service: titles.service,
  obituary: titles.obituary,
  thanks: titles.thanks,
};

/** The title for a path, or the page-not-found title when the path is not in the table. */
export function titleForPath(pathname: string): string {
  // Clerk's own sign-in steps live under /sign-in/ and are part of signing in.
  if (pathname.startsWith('/sign-in/')) {
    return titles.signIn;
  }
  const route = parsePath(pathname);
  if (route === null) {
    return notFoundTitle;
  }
  switch (route.name) {
    case 'landing':
      return titles.app;
    case 'signIn':
      return titles.signIn;
    case 'signUp':
      return titles.signUp;
    case 'people':
      return titles.people;
    case 'person':
    case 'start':
      return titles.overview;
    case 'personSection':
    case 'startSection':
      return SECTION_TITLES[route.section];
    case 'personGuide':
    case 'startGuide':
      return titles.guide;
    case 'account':
      return titles.account;
    case 'join':
      return titles.join;
  }
}

/** The page-not-found title, for the screens that show NotFound. */
export const NOT_FOUND_TITLE = notFoundTitle;

/** Sets `document.title` while the caller is mounted, and puts the earlier title back after. */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    const previous = document.title;
    document.title = title;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
