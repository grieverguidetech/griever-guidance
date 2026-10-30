import personSetup from '../screens/personSetup.json';
import pathLanding from '../screens/pathLanding.json';
import account from '../screens/account.json';
import announce from '../screens/announce.json';
import cmsPerson from '../screens/cmsPerson.json';
import cmsService from '../screens/cmsService.json';
import cmsShell from '../screens/cmsShell.json';
import obituaryDraft from '../screens/obituaryDraft.json';
import paywall from '../screens/paywall.json';
import review from '../screens/review.json';
import sending from '../screens/sending.json';
import shareObituary from '../screens/shareObituary.json';
import signIn from '../screens/signIn.json';
import signUp from '../screens/signUp.json';
import whoShouldKnow from '../screens/whoShouldKnow.json';

/** Every screen's copy. To add a screen: JSON in screens/, schema in schemas/, one line here. */
export const screens = { account, announce, cmsPerson, cmsService, cmsShell, obituaryDraft, pathLanding, personSetup, paywall, review, sending, shareObituary, signIn, signUp, whoShouldKnow } as const;

export type ScreenName = keyof typeof screens;
