import pathLanding from '../screens/pathLanding.json';
import signIn from '../screens/signIn.json';
import signUp from '../screens/signUp.json';

/** Every screen's copy. To add a screen: JSON in screens/, schema in schemas/, one line here. */
export const screens = { pathLanding, signIn, signUp } as const;

export type ScreenName = keyof typeof screens;
