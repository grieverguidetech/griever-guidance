import pathLanding from '../screens/pathLanding.json';

/**
 * Screen copy, one JSON file per screen in libs/copy/screens/. Each file has a JSON Schema of the
 * same name in libs/copy/schemas/; copy.spec.ts checks the two agree. To add a screen: add the
 * JSON, add the schema, and add one line here.
 */
const screens = { pathLanding } as const;

export type ScreenName = keyof typeof screens;

/** The shape of one screen's copy, read from its JSON file. */
export type ScreenCopy<Name extends ScreenName> = (typeof screens)[Name];

export const screenNames = Object.keys(screens) as ScreenName[];

export function screenCopy<Name extends ScreenName>(name: Name): ScreenCopy<Name> {
  return screens[name];
}

const PLACEHOLDER = /\{(\w+)\}/g;

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
    if (process.env.NODE_ENV === 'production') {
      return whole;
    }
    throw new Error(`Missing value for {${key}} in "${template}"`);
  });
}
