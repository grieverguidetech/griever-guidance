import pathLanding from '../screens/pathLanding.json';
import announce from '../screens/announce.json';
import paywall from '../screens/paywall.json';
import signIn from '../screens/signIn.json';
import signUp from '../screens/signUp.json';

/** Every screen's copy. To add a screen: JSON in screens/, schema in schemas/, one line here. */
export const screens = { announce, pathLanding, paywall, signIn, signUp } as const;

export type ScreenName = keyof typeof screens;
