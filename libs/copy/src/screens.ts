import pathLanding from '../screens/pathLanding.json';

/** Every screen's copy. To add a screen: JSON in screens/, schema in schemas/, one line here. */
export const screens = { pathLanding } as const;

export type ScreenName = keyof typeof screens;
