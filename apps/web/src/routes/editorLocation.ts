import { parsePath, paths } from './paths';
import type { Section } from './paths';

/** The editor's pages: the Overview and the five sections. */
export type EditorSection = 'overview' | Section;

/**
 * Where the editor is. Small and pure: it comes from the URL and goes back to one.
 *
 * - `flowId` is the person's flowId (a random UUID, never a name or the local id), or null for the
 *   pages shown before anyone is saved (`/start`).
 * - `item` is a checklist item open in the main column. A guide path names no section, so a spot
 *   with an item always reads as the Overview.
 */
export interface EditorSpot {
  flowId: string | null;
  section: EditorSection;
  item: string | null;
}

/** The editor spot for a pathname, or null when the path is not an editor page. */
export function spotFromPath(pathname: string): EditorSpot | null {
  const route = parsePath(pathname);
  if (!route) {
    return null;
  }
  switch (route.name) {
    case 'person':
      return { flowId: route.flowId, section: 'overview', item: null };
    case 'personSection':
      return { flowId: route.flowId, section: route.section, item: null };
    case 'personGuide':
      return { flowId: route.flowId, section: 'overview', item: route.itemId };
    case 'start':
      return { flowId: null, section: 'overview', item: null };
    case 'startSection':
      return { flowId: null, section: route.section, item: null };
    case 'startGuide':
      return { flowId: null, section: 'overview', item: route.itemId };
    default:
      return null;
  }
}

/** The path for a spot. An open item wins over the section (see EditorSpot). Throws on an id the parser would refuse. */
export function pathForSpot(spot: EditorSpot): string {
  const { flowId, section, item } = spot;
  if (flowId === null) {
    if (item !== null) {
      return paths.startGuide(item);
    }
    return section === 'overview' ? paths.start() : paths.startSection(section);
  }
  if (item !== null) {
    return paths.personGuide(flowId, item);
  }
  return section === 'overview' ? paths.person(flowId) : paths.personSection(flowId, section);
}
