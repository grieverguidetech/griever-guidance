import personSetup from '../screens/personSetup.json';
import pathLanding from '../screens/pathLanding.json';
import account from '../screens/account.json';
import announce from '../screens/announce.json';
import cmsAnnouncement from '../screens/cmsAnnouncement.json';
import cmsChecklist from '../screens/cmsChecklist.json';
import cmsObituary from '../screens/cmsObituary.json';
import cmsPerson from '../screens/cmsPerson.json';
import cmsService from '../screens/cmsService.json';
import cmsShell from '../screens/cmsShell.json';
import cmsThanks from '../screens/cmsThanks.json';
import obituaryDraft from '../screens/obituaryDraft.json';
import paywall from '../screens/paywall.json';
import phoneAccount from '../screens/phoneAccount.json';
import phoneDetails from '../screens/phoneDetails.json';
import phoneHub from '../screens/phoneHub.json';
import phonePeople from '../screens/phonePeople.json';
import phoneChecklist from '../screens/phoneChecklist.json';
import phonePerson from '../screens/phonePerson.json';
import phoneObituary from '../screens/phoneObituary.json';
import phoneReady from '../screens/phoneReady.json';
import phoneSwitcher from '../screens/phoneSwitcher.json';
import phoneTexting from '../screens/phoneTexting.json';
import review from '../screens/review.json';
import sending from '../screens/sending.json';
import shareObituary from '../screens/shareObituary.json';
import signIn from '../screens/signIn.json';
import signUp from '../screens/signUp.json';
import whoShouldKnow from '../screens/whoShouldKnow.json';

/** Every screen's copy. To add a screen: JSON in screens/, schema in schemas/, one line here. */
export const screens = { account, announce, cmsAnnouncement, cmsChecklist, cmsObituary, cmsPerson, cmsService, cmsShell, cmsThanks, obituaryDraft, pathLanding, personSetup, paywall, phoneAccount, phoneChecklist, phoneDetails, phoneHub, phoneObituary, phonePeople, phonePerson, phoneReady, phoneSwitcher, phoneTexting, review, sending, shareObituary, signIn, signUp, whoShouldKnow } as const;

export type ScreenName = keyof typeof screens;
