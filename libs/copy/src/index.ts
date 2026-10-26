import { screens } from './screens';
import type { ScreenName } from './screens';

/**
 * Screen copy, one JSON file per screen in libs/copy/screens/. Each file has a JSON Schema of the
 * same name in libs/copy/schemas/; copy.spec.ts checks the two agree.
 */
export type { ScreenName } from './screens';

/** The shape of one screen's copy, read from its JSON file. */
export type ScreenCopy<Name extends ScreenName> = (typeof screens)[Name];

export const screenNames = Object.keys(screens) as ScreenName[];

export function screenCopy<Name extends ScreenName>(name: Name): ScreenCopy<Name> {
  return screens[name];
}

export { findHardCodedCopy } from './hardCodedCopy';

const PLACEHOLDER = /\{(\w+)\}/g;

/**
 * Bundlers replace `process.env.NODE_ENV` with a literal at build time (Vite and Metro both do).
 * If one does not, `process` may not exist in a browser, so the read is guarded and the answer
 * is "not production", which is the strict choice.
 */
function isProductionBuild(): boolean {
  try {
    return process.env.NODE_ENV === 'production';
  } catch {
    return false;
  }
}

/**
 * Fill `{name}`-style placeholders. A placeholder with no value throws, so a typo shows up in dev
 * and in tests. In a production build it is left as written instead, because a thrown error would
 * blank the screen for someone who is already having a hard day.
 */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(PLACEHOLDER, (whole, key: string) => {
    const value = values[key];
    if (value !== undefined) {
      return String(value);
    }
    if (isProductionBuild()) {
      return whole;
    }
    throw new Error(`Missing value for {${key}} in "${template}"`);
  });
}
