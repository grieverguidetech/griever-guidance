// PROTOTYPE #322: tiny copy loader. Throwaway.
import pathLandingJson from '../screens/pathLanding.json';

export type PrototypeMomentKey = 'announce' | 'service' | 'obituary' | 'thanks';

export interface PrototypePathLandingCopy {
  heading: string;
  intro: string;
  forName: string;
  back: string;
  checklist: string;
  editPerson: string;
  start: string;
  continue: string;
  tagStarted: string;
  tagNext: string;
  person: string;
  people: string;
  metaStarted: string;
  metaSendAgain: string;
  moments: Record<PrototypeMomentKey, { title: string; body: string; doneLabel: string }>;
}

export const prototypePathLandingCopy: PrototypePathLandingCopy = pathLandingJson;

/** Fill {name}-style placeholders. */
export function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => values[key] ?? whole);
}
