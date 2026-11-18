import { useFocusHeadingOnChange } from '../lib/ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Navigate, useLocation, useNavigate, useNavigationType } from 'react-router';
import type { Location } from 'react-router';
import {
  useContacts,
  useSessions,
  useMembers,
  freshDraft,
  getContactsRetentionExpiry,
  hasDraftInProgress,
  resumeDraft,
  namedSessionsByRecent,
  listableSessionsByRecent,
  latestInProgressDraft,
  computeSections,
  useFlowSync,
  readRemovedFlows,
} from '@griever/hooks';
import type { Session, SendFlowDraft, UseAccountResult } from '@griever/hooks';
import { deleteFlow, getProfile } from '@griever/api-client';
import type { ProfileResult } from '@griever/api-client';
import type { ChecklistItemId, MomentKey, SectionKey, SessionDetails, TemplateCategory } from '@griever/shared';
import { contactStore } from '@griever/data-local';
import { screenCopy } from '@griever/copy';
import { AUTH_ENABLED, SHARING_ENABLED } from '../lib/features';
import { CMS_ENABLED } from '../lib/cmsFlag';
import { SYNC_ENABLED } from '../lib/syncFlag';
import { AppHeader } from '../cms/AppHeader';
import { CmsShell } from '../cms/CmsShell';
import { AccountSection, AccountSettingsSection } from '../cms/AccountSection';
import type { PersonalDetails } from '../cms/PersonalDetailsForm';
import { AccountDeleted } from '../cms/AccountDeleted';
import { AVAILABLE_SECTIONS, Overview } from '../cms/Overview';
import { PeopleList } from '../cms/PeopleList';
import { EmptySection } from '../cms/EmptySection';
import { NameNote } from '../cms/NameNote';
import { ChecklistPanel } from '../cms/checklist/ChecklistPanel';
import { ChecklistItemDetail } from '../cms/checklist/ChecklistItemDetail';
import { PersonSection } from '../cms/sections/PersonSection';
import { ServiceSection } from '../cms/sections/ServiceSection';
import { AnnouncementSection } from '../cms/sections/AnnouncementSection';
import { ObituarySection } from '../cms/sections/ObituarySection';
import { ThanksSection } from '../cms/sections/ThanksSection';
import type { CmsNavKey } from '../cms/SideNav';
import { pathForSpot, spotFromPath } from '../routes/editorLocation';
import { parsePath, paths } from '../routes/paths';
import { isSignInPath, rememberNext, rememberedNext, requireAccount } from '../routes/RequireAccount';
import type { AccountState } from '../routes/RequireAccount';
import { NotFound } from '../routes/NotFound';
import { hasSignedInMarker, loadClerk } from '../lib/authClient';
import type { ClerkAccountReady, ClerkLoadResult, ClerkModules } from '../lib/authClient';
import { Profile } from '../screens/Profile';
import { Settings } from '../screens/Settings';
import { PeopleHelping } from '../screens/PeopleHelping';
import { RemoveMember } from '../screens/RemoveMember';
import { RemovePerson } from '../cms/RemovePerson';
import { hasHiddenAccountPeople, removablePeople, removePerson } from '../lib/removePerson';
import { lacksFirstName, markPrefilled, namesToPrefill, wasPrefilled } from '../lib/prefillNames';
import type { ClerkNames } from '../lib/prefillNames';
import { deleteAccountThenClear, removeEverythingFromDevice } from '../lib/removeFromDevice';
import { AddContactsManual } from '../screens/AddContactsManual';
import type { ContactDraft } from '../screens/AddContactsManual';
import { WhoHearsFirst } from '../screens/WhoHearsFirst';
import { SessionSetup } from '../screens/SessionSetup';
import { Home } from '../screens/Home';
import { PathLanding } from '../screens/PathLanding';
import { finishNoteSpoken } from '../screens/PathLanding';
import type { FinishNote } from '../screens/PathLanding';
import { Gate } from '../screens/Gate';
import { ShareObituary } from '../screens/ShareObituary';
import { ObituaryScreen } from '../screens/ObituaryScreen';
import { Flow } from './Flow';
import type { FlowFinish } from './Flow';

type AppView =
  | 'signIn'
  | 'profile'
  | 'settings'
  | 'addContactsManual'
  | 'whoHearsFirst'
  | 'checkContacts'
  | 'setup'
  | 'home'
  | 'pathLanding'
  | 'gate'
  | 'shareObituary'
  | 'flow'
  | 'obituary'
  | 'cms'
  | 'people'
  /** A section or the Overview with nobody saved: a calm page with one next step (#597). */
  | 'noOne';

/** The editor's sections; the account is a separate view, so it is never a section. */
type CmsSection = Exclude<CmsNavKey, 'account' | 'people'>;

/** How long the landing waits for the first sync on a device with nobody saved. Never longer: C5, no blocking on the network. */
const LANDING_SYNC_WAIT_MS = 1500;
const cmsShellCopy = screenCopy('cmsShell');
const accountCopy = screenCopy('account');
const cmsItemLabels = screenCopy('cmsChecklist').items;

const MOMENT_BY_CATEGORY: Record<TemplateCategory, MomentKey> = {
  announcement: 'announce',
  service: 'service',
  obituary: 'obituary',
  aftercare: 'thanks',
};

const browserStorage =
  typeof window !== 'undefined' ? window.localStorage : undefined;

/** Tells sync the app may be online again: the window got focus, the tab became visible or the network came back. */
function subscribeToWake(onWake: () => void): () => void {
  const onVisible = () => {
    if (document.visibilityState === 'visible') {
      onWake();
    }
  };
  window.addEventListener('focus', onWake);
  window.addEventListener('online', onWake);
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    window.removeEventListener('focus', onWake);
  window.removeEventListener('online', onWake);
    document.removeEventListener('visibilitychange', onVisible);
  };
}

// Defined at module scope: a component declared inside App would be a new
// type on every render, remounting the screen and wiping what was typed.
function Shell({
  children,
  notice,
  wide = false,
}: {
  children: React.ReactNode;
  notice?: ReactNode;
  /** The editor lays out nav, editor and panel side by side; its own top space replaces the padding. */
  wide?: boolean;
}) {
  return (
    <div className="min-h-screen flex justify-center" style={{ background: 'var(--color-bg)' }}>
      <div className={wide ? 'w-full px-5 md:px-8 pb-8' : 'w-full max-w-[420px] px-5 py-8'}>
        {wide ? <AppHeader /> : null}
        {notice}
        {children}
      </div>
    </div>
  );
}

/** An always-present status region; the words appear only after a pause, so a quick load never flashes. */
function Loading({ inShell = false }: { inShell?: boolean }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setShow(true), 500);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div role="status" className={inShell ? 'text-[14px]' : 'text-[14px] pt-[52px]'} style={{ color: 'var(--text-muted)' }}>
      {show ? 'Loading…' : ''}
    </div>
  );
}

function AccountsUnavailable({ onRetry }: { onRetry: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  // Focus the heading so the message is announced; a retry that fails again mounts this anew.
  useEffect(() => {
    heading.current?.focus();
  }, []);
  return (
    <Shell>
      <div className="flex flex-col gap-3 pt-[52px]">
        <h1 ref={heading} tabIndex={-1} className="text-[22px]">Accounts aren't available right now</h1>
        <p className="text-[14px] leading-[1.6] m-0" style={{ color: 'var(--text-muted)' }}>
          Nothing you've written is lost. You can try again in a moment.
        </p>
        <button type="button" className="gg-btn gg-btn-secondary gg-btn-block" onClick={onRetry}>
          Try again
        </button>
      </div>
    </Shell>
  );
}

/**
 * Loads Clerk (its own chunk) and mounts the account provider. Rendered only when AUTH_ENABLED is
 * on. If Clerk can't be had, a device that holds the signed-in marker still opens for local work (C5).
 */
function AuthGate({
  children,
  removed,
  onRemoved,
}: {
  children: (state: ClerkAccountReady, SignInScreen: ClerkModules['SignInScreen']) => ReactNode;
  removed: boolean;
  onRemoved: () => void;
}) {
  const [loaded, setLoaded] = useState<ClerkLoadResult | null>(null);
  // Bumped by "Try again"; loadClerk forgets a failed load, so this runs it afresh.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    void loadClerk().then((result) => {
      if (live) {
        setLoaded(result);
      }
    });
    return () => {
      live = false;
    };
  }, [attempt]);

  const retry = () => {
    setLoaded(null);
    setAttempt((n) => n + 1);
  };

  if (!loaded) {
    return (
      <Shell>
        <Loading />
      </Shell>
    );
  }
  if (!loaded.available && hasSignedInMarker()) {
    // Accounts can't be reached, but this device holds a signed-in marker: the work on it is
    // theirs and stays reachable (C5). No account actions, and nothing here touches the network.
    return <AppBody auth={null} offline removed={removed} onRemoved={onRemoved} />;
  }
  if (!loaded.available) {
    return <AccountsUnavailable onRetry={retry} />;
  }
  const { ClerkAccount, SignInScreen } = loaded;
  return (
    <ClerkAccount>
      {(state) => (state.unavailable ? <AccountsUnavailable onRetry={retry} /> : children(state, SignInScreen))}
    </ClerkAccount>
  );
}

const REMOVED_MESSAGE = 'Everything has been removed from this device.';

export function App() {
  // Bumped after "Remove everything from this device": the key remounts every hook, so each
  // reads the now-empty storage and starts from the first screen.
  const [removals, setRemovals] = useState(0);
  const removed = removals > 0;
  // The account was deleted: the done screen replaces the whole app.
  const [deleted, setDeleted] = useState<{ cleared: boolean } | null>(null);
  const onDeleted = useCallback((cleared: boolean) => setDeleted({ cleared }), []);
  // The announcement lives outside the keyed subtree so it is already in the page when its text
  // arrives. It is emptied on removal and filled a moment after the remount, so it is read out.
  const [announcement, setAnnouncement] = useState('');
  const onRemoved = useCallback(() => {
    setAnnouncement('');
    setRemovals((n) => n + 1);
  }, []);
  useEffect(() => {
    if (removals === 0) return;
    const timer = setTimeout(() => setAnnouncement(REMOVED_MESSAGE), 50);
    return () => clearTimeout(timer);
  }, [removals]);
  // With the flag off nothing auth-related loads or renders, and the app is as it was.
  const body = !AUTH_ENABLED ? (
    <AppBody key={removals} auth={null} removed={removed} onRemoved={onRemoved} />
  ) : (
    <AuthGate key={removals} removed={removed} onRemoved={onRemoved}>
      {(state, SignInScreen) => (
        <AppBody
          auth={state.account}
          getAccessToken={state.getAccessToken}
          endSession={state.signOut}
          accountEmail={state.email}
          clerkNames={state.clerkNames}
          openAccountSettings={state.openAccountSettings}
          deleteAccount={state.deleteAccount}
          onDeleted={onDeleted}
          SignInScreen={SignInScreen}
          removed={removed}
          onRemoved={onRemoved}
        />
      )}
    </AuthGate>
  );
  if (deleted) {
    return <AccountDeleted cleared={deleted.cleared} />;
  }
  return (
    <>
      {removed && (
        <div role="status" aria-live="polite" className="sr-only">
          {announcement}
        </div>
      )}
      {body}
    </>
  );
}

/** True when the signed-in account has no name yet (or the name is blank). */
function lacksName(result: ProfileResult): boolean {
  if (result.ok) return !result.profile.senderName?.trim();
  return result.reason === 'no_profile';
}

const NAME_CHECK_TIMEOUT_MS = 5000;
const CONTACTS_CHECK_FALLBACK_MS = 1500;

/**
 * Asks the server whether the account has a name, in the background. A slow or failed answer
 * counts as "has a name": it must never hold anyone back (C5), and Profile is always reachable.
 */
async function accountLacksName(getAccessToken: () => Promise<string | null>): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), NAME_CHECK_TIMEOUT_MS);
  });
  try {
    const lookup = getAccessToken().then(async (token) => (token ? lacksName(await getProfile(token)) : false));
    return await Promise.race([lookup, timedOut]);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Views that need a person to be open; with nobody open Home is shown instead. */
const NEEDS_PERSON: AppView[] = ['pathLanding', 'flow', 'setup', 'gate', 'shareObituary', 'obituary', 'cms'];

const ITEM_IDS = Object.keys(cmsItemLabels) as ChecklistItemId[];

/**
 * What this app stores on a history entry: the calm line on Your people after a person's page could
 * not be opened. Every screen and checklist item has a path (#849, #850, #856), so Back is the browser's
 * own. The `openedHere` marker (see `openedHere`, after this) is the other thing stored.
 */
interface EntryState {
  /** Your people after a person's page could not be opened: a calm line, never the id. */
  missing: boolean;
}

/** What this app stored on a history entry. Anything else (another app, a hand-made entry) reads as nothing. */
function readEntry(state: unknown): EntryState {
  const raw = typeof state === 'object' && state !== null ? (state as Record<string, unknown>) : {};
  return { missing: raw['missing'] === true };
}

/**
 * An item entry that this app pushed from one of its own pages carries `openedHere` in its state, so
 * closing it can go Back to that page. It survives a reload (the state stays on the entry), and a
 * link or a hand-typed address never has it.
 */
function openedHere(state: unknown): boolean {
  return typeof state === 'object' && state !== null && (state as Record<string, unknown>)['openedHere'] === true;
}

/** Where the editor goes: a person's page, an empty page, Your people or Your account (all paths). */
interface Spot {
  /** 'profile' (signed in) and 'settings' (signed out) are the two versions of the one /account path. */
  view: 'cms' | 'noOne' | 'people' | 'profile' | 'settings';
  section?: CmsSection;
  item?: ChecklistItemId | null;
  /** The person for 'cms'. */
  person?: Session | null;
  /** Your people after a person's page could not be opened by an unknown id: shows the calm line. */
  missing?: boolean;
}

/**
 * A person's page path, or null when their flowId is not a path id (it should always be one: a
 * random UUID, made on load for people saved before sharing). Null keeps the editor usable rather
 * than failing the whole render.
 */
function pagePathFor(person: Session, section: CmsSection): string | null {
  if (spotFromPath(`/people/${person.flowId}`) === null) {
    return null;
  }
  return pathForSpot({ flowId: person.flowId, section, item: null });
}

/** The state this app stored on the current history entry (React Router keeps it under `usr`). */
function entryState(): unknown {
  const raw: unknown = window.history.state;
  return typeof raw === 'object' && raw !== null ? ((raw as { usr?: unknown }).usr ?? null) : null;
}

/** The App paths that are not editor pages: the landing target replaces them once per load. */
// `/join` keeps today's behavior (the App lands from any of its paths); the join ticket must remove it.
// The sign-in paths are not here: the sign-in guard sends a signed-in visitor on to `next` (#851).
const LANDING_PATHS = ['/', '/join'];
/** The paths Back walks past while signed in (Clerk's sign-in steps live there, `/sign-in/...`), as #566 did. */
function isWalkPath(pathname: string): boolean {
  return pathname === '/' || pathname === '/sign-up' || isSignInPath(pathname);
}
/** Most automatic Back moves in a row, so an odd history can never loop. */
const MAX_WALK = 50;

function AppBody({
  auth,
  getAccessToken,
  endSession,
  accountEmail,
  clerkNames,
  openAccountSettings,
  deleteAccount,
  onDeleted,
  SignInScreen,
  offline = false,
  removed = false,
  onRemoved,
}: {
  auth: UseAccountResult | null;
  /** Everything was just removed from this device: say so on the first screen. */
  removed?: boolean;
  onRemoved: () => void;
  /** The token for the signed-in account, or null. Absent when there is no account to ask. */
  getAccessToken?: () => Promise<string | null>;
  /** Ends the Clerk session; used by "Remove everything from this device". */
  endSession?: () => Promise<void>;
  /** The signed-in email and Clerk's own account screen, for Your account. */
  accountEmail?: string | null;
  /** The names on the Clerk user, used once to fill a profile that has none. */
  clerkNames?: ClerkNames;
  openAccountSettings?: () => void;
  /** Deletes the Clerk account; absent when Clerk is not ready. */
  deleteAccount?: () => Promise<void>;
  onDeleted?: (cleared: boolean) => void;
  SignInScreen?: ClerkModules['SignInScreen'];
  /** Signed in on this device, but accounts can't be reached: local work only. */
  offline?: boolean;
}) {
  const contacts = useContacts(contactStore);
  const sessions = useSessions(browserStorage, auth?.userId);
  const sessionList = sessions.sessions;
  // Without auth there is no account gate — everyone is let straight in.
  const isSignedIn = auth ? auth.isSignedIn : true;

  // Family sharing. With either flag off, or nobody signed in, the hook is switched off and makes no
  // calls. Nothing waits on it (C5): screens render first and the list fills in. The token is read
  // from the session in memory for each call and goes nowhere else.
  const sharingOn = AUTH_ENABLED && SHARING_ENABLED && !offline && !!getAccessToken && !!auth?.isSignedIn;
  // A failed token read counts as no token: the hook reports "sign in again" rather than loading forever.
  const memberToken = useCallback(async () => (getAccessToken ? getAccessToken().catch(() => null) : null), [getAccessToken]);
  const members = useMembers({ getAccessToken: memberToken, enabled: sharingOn });

  // Background sync of the person to the account. Only in the editor build (the 4 message keys stay
  // off the wire when the editor is off, C2), with sync on and someone signed in. Nothing is shown (C5).
  // True while the account is being deleted: no pull or flush runs, and the sign-out Clerk causes is not shown as a lost session.
  const [deletingAccount, setDeletingAccount] = useState(false);
  const syncOn = CMS_ENABLED && SYNC_ENABLED && AUTH_ENABLED && !offline && !!getAccessToken && !!auth?.isSignedIn && !deletingAccount;
  // Sync waits until the device's list is kept for this account, so another account's person is never sent under this token.
  const flowSync = useFlowSync({
    sessions: sessionList,
    userId: auth?.userId ?? '',
    getAccessToken: memberToken,
    enabled: syncOn && sessions.heldFor === auth?.userId,
    storage: browserStorage,
    subscribe: subscribeToWake,
    applyRemoteFlows: sessions.applyRemoteFlows,
  });

  // The screen for everything the URL does not decide: the old flows (editor off) and the moment before
  // the editor's landing. In the editor build the history entry decides the rest; sign-in is a path (#851).
  // Home is always the first screen, with or without people (A2b); contacts come later in the walk.
  const [baseView, setView] = useState<AppView>('home');
  const location = useLocation();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const sortedSessions = useMemo(
    () => (CMS_ENABLED ? listableSessionsByRecent : namedSessionsByRecent)([...sessions.sessions]),
    [sessions.sessions],
  );
  // Set once per load (and again after a sign-out) when the editor has shown its first screen.
  const landed = useRef(false);
  // With sync on and nobody saved (a fresh device), the first pull may bring people: wait for it, for a short cap.
  const [syncWaitOver, setSyncWaitOver] = useState(false);
  const waitingForSync = syncOn && !flowSync.pulled && !syncWaitOver;

  // Back after sign-in (#566, option (a) on #849): a POP onto `/`, `/sign-in` or `/sign-up` while signed
  // in is one of Clerk's sign-in steps (or the page before them). Go Back again, past all of them, and
  // keep showing the last screen meanwhile, so the app is left like a site with no sign-in. Past the sign-in
  // steps, only a page of a person who is here stops the walk (see isForeign).
  // Known edge case: Forward from the previous site into those entries, when the browser restores this
  // page from its back/forward cache (no reload), is a POP too and walks Back again. MAX_WALK caps it.
  const walkMoves = useRef(0);
  // True once this walk has stepped off a sign-in entry (see isForeign).
  const walkedPastSignIn = useRef(false);
  const lastOwn = useRef<Location>(location);
  function isForeign(entryLocation: Location): boolean {
    if (!CMS_ENABLED || !landed.current || !isSignedIn) {
      return false;
    }
    // An empty page once someone exists is gone: Back walks on past it (#597), as the old history hook did.
    if (spotFromPath(entryLocation.pathname)?.flowId === null && sortedSessions.length > 0) {
      return true;
    }
    // Below the sign-in steps lies another site or an earlier sign-in in this tab: only a page of a person
    // who is here stops the walk there. (Your people, Account and the empty pages are not news after a walk.)
    if (walkedPastSignIn.current) {
      const spot = spotFromPath(entryLocation.pathname);
      return !spot?.flowId || !sessionList.some((s) => s.flowId === spot.flowId);
    }
    if (isWalkPath(entryLocation.pathname)) {
      return true;
    }
    return false;
  }
  // The load's own entry is never walked: it is where the landing starts, not a Back.
  const loadLocation = useRef(location);
  const walking = navigationType === 'POP' && location !== loadLocation.current && isForeign(location);
  // Written during render on purpose: the screen to keep showing must be known in the same render that
  // meets a foreign entry. It only ever holds the latest own location, so a repeated render writes the same value.
  if (!walking) {
    lastOwn.current = location;
  }
  const shown = walking ? lastOwn.current : location;

  // The editor's spot, derived from the path shown (#849, #850): every screen has one.
  const entry = readEntry(CMS_ENABLED ? shown.state : null);
  const pathSpot = CMS_ENABLED ? spotFromPath(shown.pathname) : null;
  const screenRoute = CMS_ENABLED ? parsePath(shown.pathname) : null;
  const peoplePath = screenRoute?.name === 'people';
  const accountPath = screenRoute?.name === 'account';
  const personPath = pathSpot?.flowId ? pathSpot : null;
  const pathPerson = personPath ? (sessionList.find((s) => s.flowId === personPath.flowId) ?? null) : null;
  // The sign-in screen is a path (#851): `/sign-in` and Clerk's steps under it, while nobody is signed in.
  // `/join` is public and keeps the sign-in it showed before (its fragment stays; #128 changes it).
  const showSignIn = auth !== null && !auth.isSignedIn && (isSignInPath(shown.pathname) || shown.pathname === '/join');
  const startPath = pathSpot !== null && pathSpot.flowId === null;
  // /account is one path with two versions: the signed-in one, and Settings when nobody is signed in.
  const accountView: AppView = auth?.isSignedIn ? 'profile' : 'settings';
  const editorView: AppView = !CMS_ENABLED
    ? baseView
    : peoplePath
      ? 'people'
      : accountPath
        ? accountView
        : personPath
          ? 'cms'
          : startPath
            ? 'noOne'
            : baseView;
  const view: AppView = showSignIn ? 'signIn' : editorView;
  const cmsSection: CmsSection = pathSpot?.section ?? 'overview';
  // An item is in the path (guide URLs).
  const pathItem = ITEM_IDS.find((id) => id === pathSpot?.item) ?? null;
  const cmsItem: ChecklistItemId | null = pathItem;
  // A person's page whose person is not on this device: deleted, another account's, or not pulled yet.
  const personMissing = view === 'cms' && personPath !== null && pathPerson === null;
  // An editor path the table refuses (or any editor path with the editor off).
  // A guide path whose item is not one of ours is not found either.
  const editorPath =
    location.pathname.startsWith('/people/') ||
    location.pathname.startsWith('/start') ||
    location.pathname === '/people' ||
    location.pathname === '/account';
  const notFound =
    editorPath &&
    (!CMS_ENABLED || (pathSpot === null && !peoplePath && !accountPath) || (pathSpot !== null && pathSpot.item !== null && pathItem === null));

  // Shown once, on the first screen after a removal; leaving it ends it for good. The first screen is
  // the first one shown, not a loading moment or a guard move before it (see `firstView` below).
  const firstView = useRef<AppView | null>(null);
  const [showRemoved, setShowRemoved] = useState(removed);
  // The open person with the editor off. With it on, the URL names the person (see `active` below).
  const [activeId, setActiveId] = useState<string | null>(null);
  // Which moment's draft the flow opens with. Undefined (a returning visit) means the one
  // changed most recently.
  const [flowCategory, setFlowCategory] = useState<TemplateCategory | undefined>(undefined);
  const [setupEditing, setSetupEditing] = useState(false);
  // Where the open item was opened from, so Back can return to that button.
  // Set once a close has started Back, until the router commits the new entry: a second tap does nothing.
  const closing = useRef(false);
  const itemOpener = useRef<{ id: ChecklistItemId; region: 'main' | 'panel' | 'sheet' } | null>(null);
  const restoreOpener = useRef(false);
  // Where Back from "Edit person" returns: the form it was opened from, or the path.
  const setupReturn = useRef<AppView>('flow');
  // The quiet note on the path after the last person was handed a message. It lasts until the
  // person goes anywhere else or closes it (#176).
  const [finishNote, setFinishNote] = useState<FinishNote | null>(null);
  useEffect(() => {
    if (view !== 'pathLanding') setFinishNote(null);
  }, [view]);
  // The spoken copy of the note lives in a region that stays mounted across views (like
  // signedOutNote) and is filled a moment after the path's heading takes focus.
  const [finishAnnouncement, setFinishAnnouncement] = useState('');
  useEffect(() => {
    if (!finishNote) {
      setFinishAnnouncement('');
      return;
    }
    const timer = setTimeout(() => setFinishAnnouncement(finishNoteSpoken(finishNote)), 100);
    return () => clearTimeout(timer);
  }, [finishNote]);
  // True from "Create a new one" until who-hears-first is saved: setup, then contacts (only when
  // this device has none), then who hears first. This is the only way a person is created.
  const [creating, setCreating] = useState(false);
  // The contacts step was skipped because contacts were already saved, so Back from who hears
  // first goes to setup instead.
  const [contactsSkipped, setContactsSkipped] = useState(false);
  // Typed or ticked but not yet saved on the contacts steps; kept here so opening the checklist
  // from a step does not lose it. Cleared when the walk starts and ends.
  const [contactDraft, setContactDraft] = useState<ContactDraft>({ name: '', phone: '', hearsFirst: false });
  const [firstTicks, setFirstTicks] = useState<string[] | null>(null);
  // The account has no name: Profile opens with a "What should we call you?" prompt.
  const [needsName, setNeedsName] = useState(false);
  const [askingName, setAskingName] = useState(false);
  // Bumped on every sign-in and every sign-out. A name check started under an earlier
  // number is for a different sign-in, so its answer is dropped (it must not prompt someone else).
  const accountGeneration = useRef(0);
  // Where the prompt interrupted, so Save or Back returns there and onboarding carries on.
  // Editor off only: the name prompt returns here after Save. Editor on, Back is the browser's, so nothing sets it.
  const [returnTo, setReturnTo] = useState<AppView>('home');
  // Set by the Sign out button, so only that (not a session that ended elsewhere) leaves the screen.
  const [leftOnPurpose, setLeftOnPurpose] = useState(false);

  const signedIn = auth?.isSignedIn ?? false;
  const signedOut = auth !== null && !auth.isLoading && !auth.isSignedIn;
  // True when the session ended while someone was using the app, other than with the Sign out button.
  // Until they sign in again or open the sign-in screen, the guard leaves them on any page they move to,
  // with the note. Only a cold load, or a move after the sign-in screen, goes to sign-in (#851). Written
  // during render so the guard below knows in the same render.
  const hadSession = useRef(false);
  const ended = useRef(false);
  if (signedIn) {
    hadSession.current = true;
    ended.current = false;
  } else if (signedOut && hadSession.current) {
    hadSession.current = false;
    ended.current = !leftOnPurpose;
  }
  if (showSignIn) {
    ended.current = false;
  }
  const endedHere = signedOut && ended.current;
  const accountState: AccountState = !AUTH_ENABLED
    ? 'off'
    : !auth
      ? 'local'
      : auth.isLoading
        ? 'loading'
        : auth.isSignedIn
          ? 'signed_in'
          : endedHere || deletingAccount
            ? 'stay'
            : leftOnPurpose
              ? 'left'
              : 'signed_out';
  // The sign-in guard. Not during the Back walk (#566): that walk moves through history on its own.
  const guardTo = walking
    ? null
    : requireAccount({ pathname: location.pathname, search: location.search, account: accountState, remembered: rememberedNext() });
  // The guard's `next` is also kept in this tab, for a sign-in that returns on a URL without it (SSO,
  // email links). A bare /sign-in clears it. It is used up once a signed-in page is shown, not while
  // the guard is still moving there (a re-render then would lose the target).
  const inApp = accountState === 'signed_in' || accountState === 'local' || accountState === 'off';
  useEffect(() => {
    if (isSignInPath(location.pathname)) {
      return;
    }
    if (guardTo !== null) {
      rememberNext(new URLSearchParams(guardTo.split('?')[1] ?? '').get('next'));
    } else if (inApp) {
      rememberNext(null);
    }
  }, [guardTo, location.pathname, inApp]);
  const screenShown = guardTo === null && !auth?.isLoading;
  useEffect(() => {
    if (!screenShown) {
      return;
    }
    if (firstView.current === null) {
      firstView.current = view;
    } else if (view !== firstView.current) {
      setShowRemoved(false);
    }
  }, [view, screenShown]);
  // The editor's sections share one view, so the section is part of the key: a change moves focus to the h1.
  // Someone arriving on the empty page keeps the same key, so focus does not jump mid-read (they hear a polite note instead).
  const [arrivedQuietly, setArrivedQuietly] = useState(false);
  const [arrivalNote, setArrivalNote] = useState('');
  // The calm line is also said once, from a region that is already in the page (filled a moment later).
  const missingShown = view === 'people' && entry.missing;
  const [missingAnnouncement, setMissingAnnouncement] = useState('');
  useEffect(() => {
    if (!missingShown) {
      setMissingAnnouncement('');
      return;
    }
    const timer = setTimeout(() => setMissingAnnouncement(cmsShellCopy.personMissing), 100);
    return () => clearTimeout(timer);
  }, [missingShown]);
  // Back or Forward restored an entry: what onRestore did under the old history hook (#566). Declared
  // before the heading hook, so a closed item hands focus back to its opener after the h1 took it.
  const mounted = useRef(false);
  const shownItem = useRef(cmsItem);
  useEffect(() => {
    if (mounted.current && navigationType === 'POP' && !walking) {
      // Back never lands in the name prompt, and an error from another screen is not carried over.
      auth?.clearError();
      setAskingName(false);
      if (shownItem.current !== null && cmsItem === null) {
        restoreOpener.current = true;
      } else if (cmsItem !== null) {
        // Landed on an item (Forward, or Back from a later page): nothing is waiting to be focused.
        restoreOpener.current = false;
      }
    }
    mounted.current = true;
    shownItem.current = cmsItem;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);
  useEffect(() => {
    closing.current = false;
  }, [location.key]);
  // The signed-in and signed-out versions of /account are one screen, so one key: a session that ends
  // while someone types there changes the version, not the focus.
  useFocusHeadingOnChange(
    view === 'noOne' || (view === 'cms' && arrivedQuietly)
      ? `empty:${cmsSection}:${cmsItem ?? ''}`
      : view === 'cms'
        ? `cms:${pathPerson?.flowId ?? ''}:${cmsSection}:${cmsItem ?? ''}`
        : accountPath
          ? 'account'
          : view,
  );
  // Must stay declared after the heading hook above: effects run in order, so this one lands
  // on the opener after the hook has put focus on the h1. The sheet's button is gone, so the h1 stays.
  useEffect(() => {
    if (!restoreOpener.current || cmsItem !== null) {
      return;
    }
    restoreOpener.current = false;
    const opener = itemOpener.current;
    itemOpener.current = null;
    if (!opener) {
      return;
    }
    let target: HTMLElement | null = null;
    if (opener.region === 'sheet') {
      // The sheet's own button is gone; its phone button opened it. Hidden from `lg`, where focus stays on the h1.
      target = document.querySelector<HTMLElement>('[data-checklist-opener]');
    } else if (opener.region === 'panel') {
      // CmsShell renders exactly one <main> and one <aside>, so these selectors find one region each.
      target = document.querySelector<HTMLElement>(`aside [data-checklist-item="${opener.id}"]`);
    } else {
      // The item may have moved on (marked done), so the Next button can now name another item.
      target =
        document.querySelector<HTMLElement>(`main [data-checklist-item="${opener.id}"]`) ??
        document.querySelector<HTMLElement>('main [data-checklist-item]');
    }
    target?.focus();
  });
  const clearError = auth?.clearError;

  /** Opens Your account. Returns false when it was already open (no move). */
  function openProfile(asksName: boolean, from: AppView = 'home'): boolean {
    // A stale error from another screen would otherwise show here without being announced.
    clearError?.();
    setAskingName(asksName);
    // Editor off only (the name prompt's return); editor on, Back is the browser's.
    if (!CMS_ENABLED) {
      setReturnTo(from);
    }
    setNeedsName(false);
    if (CMS_ENABLED) {
      return go({ view: 'profile' });
    }
    setView('profile');
    return true;
  }

  /** Your account in the editor: one path, the signed-in version or Settings when nobody is signed in. Returns whether it moved. */
  function openAccount(): boolean {
    if (auth?.isSignedIn) {
      return openProfile(false);
    }
    return go({ view: 'settings' });
  }

  // Sign-in resolves asynchronously (the boot-time session check, or the Clerk form), so the
  // next view can't be decided in useState's initializer. Everyone lands on Home.
  // True until the first sign-in of this load, and again whenever the sign-in screen shows.
  const awaitingSignIn = useRef(true);
  useEffect(() => {
    if (view === 'signIn') {
      awaitingSignIn.current = true;
      return;
    }
    if (!signedIn || !awaitingSignIn.current) return;
    awaitingSignIn.current = false;
    setFlowCategory(undefined);
    setView('home');
    // Ask in the background whether the account has a name. It never holds anyone back, and it
    // clears a prompt left over from an earlier session.
    // Editor on: no prompt. Names come from Clerk, and Overview shows a note when there is still none.
    if (getAccessToken && !CMS_ENABLED) {
      accountGeneration.current += 1;
      const generation = accountGeneration.current;
      void accountLacksName(getAccessToken).then((lacks) => {
        if (generation === accountGeneration.current) setNeedsName(lacks);
      });
    }
  }, [signedIn, view, getAccessToken]);

  // Orphan unnamed people from the old flow would otherwise sit on the device; tidy them once.
  const pruneEmpty = sessions.pruneEmpty;
  useEffect(() => {
    pruneEmpty();
  }, [pruneEmpty]);


  // An account with no name (a failed save at sign-up, or a sign-in to one): ask for it, then
  // return to wherever this interrupted.
  useEffect(() => {
    if (signedIn && needsName && view !== 'signIn' && view !== 'profile') openProfile(true, view);
  }, [signedIn, needsName, view, openProfile]);

  // No session, no prompt: it would be stale by the next sign-in.
  useEffect(() => {
    if (!signedOut) return;
    accountGeneration.current += 1;
    if (needsName) setNeedsName(false);
  }, [signedOut, needsName]);

  // Only the Sign out button sends the person back to sign-in (the guard moves them to `/sign-in`). A
  // session that ended some other way keeps them where they are, with a note. The next sign-in lands on Home.
  useEffect(() => {
    if (signedOut && leftOnPurpose) {
      setFlowCategory(undefined);
      setView('home');
    }
    // Cleared once the sign-in screen is reached, so the guard never sends them twice.
    if (leftOnPurpose && view === 'signIn') {
      setLeftOnPurpose(false);
    }
  }, [signedOut, leftOnPurpose, view]);
  const sessionEnded = endedHere && view !== 'signIn' && !deletingAccount;
  // One polite region that is always there, so the note is announced when its text appears.
  const signedOutNote = auth ? (
    <div role="status" aria-live="polite" className="text-[13px]">
      {sessionEnded && (
        <div className="flex flex-col gap-1 mb-4">
          <p className="m-0">You've been signed out. Your work on this device is safe. Sign in again when you're ready.</p>
          <button
            type="button"
            onClick={() => {
              rememberNext(location.pathname);
              navigate(paths.signIn(location.pathname), { replace: true });
            }}
            className="gg-btn gg-btn-ghost self-start !px-0"
          >
            Sign in
          </button>
        </div>
      )}
    </div>
  ) : offline ? (
    <div role="status" aria-live="polite" className="text-[13px] mb-4">
      <p className="m-0">Your account can't be reached right now. Your work on this device is here.</p>
    </div>
  ) : null;

  const removedNote = (
    // Announced by the region in App, so it is hidden from readers here to avoid saying it twice.
    <div className="text-[13px]" aria-hidden="true">
      {showRemoved && <p className="m-0 mb-4">{REMOVED_MESSAGE}</p>}
    </div>
  );
  const saveFailedNote = CMS_ENABLED && sessions.saveFailed && (
    <p role="status" className="m-0 mb-4 text-[13px]" style={{ color: 'var(--text-muted)' }}>
      {cmsShellCopy.saveFailed}
    </p>
  );
  const endedNote = (
    <>
      {removedNote}
      {signedOutNote}
      {saveFailedNote}
      <div role="status" aria-live="polite" className="sr-only">
        {finishAnnouncement}
      </div>
      <div role="status" aria-live="polite" className="sr-only">
        {arrivalNote}
      </div>
      <div role="status" aria-live="polite" className="sr-only">
        {missingAnnouncement}
      </div>
    </>
  );

  async function removeEverything() {
    // Local only: ending the Clerk session deletes nothing on a server.
    await removeEverythingFromDevice(window.localStorage, endSession);
    // The fresh app starts from `/`, as after a load, rather than on the screen this was pressed on.
    if (CMS_ENABLED) {
      navigate('/', { replace: true });
    }
    onRemoved();
  }

  const canCreate = !(sharingOn && auth?.profile?.accountType === 'member');
  // Remove a person (Account only). The decisions live in lib/removePerson; this passes it the hooks.
  function removeOnePerson(id: string) {
    const target = sessionList.find((s) => s.id === id);
    return removePerson({
      syncOn,
      flowId: target?.flowId,
      getToken: memberToken,
      deleteFlow,
      removeLocal: () => sessions.removeSession(id),
    });
  }
  const removablePeopleList = removablePeople(sortedSessions, syncOn);
  // Account-tied people are hidden while the server is out of reach; say why. Signed out: sign in. Anything else: a connection.
  const removeNote = hasHiddenAccountPeople(sortedSessions, syncOn)
    ? auth && !auth.isSignedIn && !auth.isLoading
      ? accountCopy.removeSignInHint
      : accountCopy.removeOfflineHint
    : undefined;
  const removePersonPanel = CMS_ENABLED ? (
    <RemovePerson people={removablePeopleList} scope={syncOn ? 'account' : 'device'} onRemove={removeOnePerson} note={removeNote} />
  ) : undefined;

  // Editor off: picks the most recent person when none is open. It never creates one: Home's "Create
  // a new one" is the only way to start a person.
  useEffect(() => {
    if (CMS_ENABLED || !isSignedIn || activeId || sortedSessions.length === 0) return;
    setActiveId(sortedSessions[0].id);
  }, [isSignedIn, activeId, sortedSessions]);

  // Editor on: the person the URL names. Your people and the empty pages have none. Your account has no
  // person in its path, so it shows the most recent one; a person's page counts as opening them (below).
  const editorActive =
    view === 'cms' ? pathPerson : view === 'people' || view === 'noOne' ? null : (pathPerson ?? sortedSessions[0] ?? null);
  // Showing a person's page makes them the most recent, so Your account (no person in its path) and its
  // links name the person the visitor was just looking at, also after a deep link, a bookmark or Back.
  const touchSession = sessions.touchSession;
  const shownPersonId = view === 'cms' ? (pathPerson?.id ?? null) : null;
  useEffect(() => {
    if (CMS_ENABLED && shownPersonId !== null) {
      touchSession(shownPersonId);
    }
  }, [shownPersonId, touchSession]);
  const stateActive = sessions.sessions.find((s) => s.id === activeId) ?? null;
  const active: Session | null = CMS_ENABLED ? editorActive : stateActive;

  /**
   * The one way the editor moves (#849, #850). Every spot has a path: a person's page, an empty page,
   * Your people (`/people`) and Your account (`/account`, signed in or out). The same spot again adds no
   * entry. Returns whether it moved. Confirm steps are not spots: they have no path (C9).
   */
  function go(spot: Spot, { replace = false, mark = false }: { replace?: boolean; mark?: boolean } = {}): boolean {
    let pathname: string;
    let state: Record<string, unknown> | null = null;
    if (spot.view === 'cms') {
      const person = spot.person;
      const path = person ? pagePathFor(person, spot.section ?? 'overview') : null;
      if (!person || !path) {
        return false;
      }
      pathname = spot.item ? pathForSpot({ flowId: person.flowId, section: 'overview', item: spot.item }) : path;
      state = mark ? { openedHere: true } : null;
    } else if (spot.view === 'noOne') {
      pathname = pathForSpot({ flowId: null, section: spot.section ?? 'overview', item: spot.item ?? null });
      state = mark ? { openedHere: true } : null;
    } else if (spot.view === 'people') {
      pathname = paths.people();
      // A person's page that could not be opened: the id leaves the address bar, a calm line says so.
      state = { missing: spot.missing ?? false };
    } else {
      pathname = paths.account();
    }
    if (pathname === location.pathname && JSON.stringify(readEntry(state)) === JSON.stringify(readEntry(location.state))) {
      return false;
    }
    navigate(pathname, { replace, state });
    return true;
  }

  // B1: pruning an unnamed person must wait until the move away from their page has committed. The
  // router applies a location in a transition, so a prune first would show their old path with nobody
  // behind it for a render, and the missing-person rule would answer it.
  const pruneAfterMove = useRef(false);
  useEffect(() => {
    if (pruneAfterMove.current) {
      pruneAfterMove.current = false;
      sessions.pruneEmpty();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);
  /** Runs `move`, then drops an unnamed person once the new screen is in place (at once if nothing moved). */
  function moveThenPrune(move: () => boolean) {
    pruneAfterMove.current = true;
    if (!move()) {
      pruneAfterMove.current = false;
      sessions.pruneEmpty();
    }
  }

  /** The current editor spot, to change one part of it. */
  const here: Spot = {
    view: view === 'cms' || view === 'noOne' || view === 'people' || view === 'profile' || view === 'settings' ? view : 'noOne',
    section: cmsSection,
    item: cmsItem,
    person: active,
  };

  /** The side nav's link for an item: Your people, Your account, and a person's Overview and sections. */
  function navHref(person: Session | null) {
    return (key: CmsNavKey): string | null => {
      if (key === 'people') {
        return paths.people();
      }
      if (key === 'account') {
        return paths.account();
      }
      return person ? pagePathFor(person, key) : null;
    };
  }

  // With no one open these views have nothing to show, and Home stands in; keep the state honest.
  // (Editor on, the URL names the person; a missing one is handled below.)
  useEffect(() => {
    if (!CMS_ENABLED && !active && NEEDS_PERSON.includes(view)) setView('home');
  }, [active, view]);

  // Someone arrived (a sync, or a share) while the empty page was open: carry on in the editor, same section.
  // Not while "Start" is making the person: that opens The person itself.
  useEffect(() => {
    if (view === 'noOne' && sortedSessions.length > 0 && !creatingNow.current) {
      setArrivedQuietly(true);
      setArrivalNote(cmsShellCopy.arrivedNote);
      go({ view: 'cms', person: sortedSessions[0], section: cmsSection }, { replace: true });
    }
  });

  // A person's page whose person is not here (#566 rules): wait for the first pull while it may still
  // bring them, then replace the entry with Your people and a calm line. The id is never shown, and it
  // leaves the address bar.
  useEffect(() => {
    if (!personMissing || walking || waitingForSync || !isSignedIn) {
      return;
    }
    // Removed on this device (or seen earlier in this load, then dropped): no line, it is not news.
    const flowId = personPath?.flowId ?? '';
    const removedHere = seenFlows.current.has(flowId) || (readRemovedFlows(browserStorage) ?? []).some((mark) => mark.id === flowId);
    go({ view: 'people', missing: !removedHere }, { replace: true });
  });
  // Every person this load has shown, so a page of one who is gone since reads as removed, not unknown.
  const seenFlows = useRef(new Set<string>());
  useEffect(() => {
    for (const s of sessionList) {
      seenFlows.current.add(s.flowId);
    }
  }, [sessionList]);

  // The Back walk past the sign-in entries (see `isForeign`). One step when the walk starts, then one
  // more on each popstate that lands on another foreign entry. The router does not re-render between two
  // foreign entries (same path, no state, key 'default'), so this listens to popstate itself and reads the
  // entry directly; React Router keeps the state we passed under `usr`.
  const isForeignRef = useRef(isForeign);
  isForeignRef.current = isForeign;
  useEffect(() => {
    if (!walking) {
      walkMoves.current = 0;
      walkedPastSignIn.current = false;
      return;
    }
    function step() {
      if (walkMoves.current >= MAX_WALK) {
        return;
      }
      if (isWalkPath(window.location.pathname)) {
        walkedPastSignIn.current = true;
      }
      walkMoves.current += 1;
      // The same move as navigate(-1); the router reads the entry it lands on like any Back.
      window.history.back();
    }
    function onPop() {
      if (isForeignRef.current({ ...location, pathname: window.location.pathname, state: entryState() })) {
        step();
      }
    }
    step();
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walking]);

  const { updateDraft, updateSession, recordMomentComplete } = sessions;
  const onDraftChange = useCallback(
    (d: SendFlowDraft) => {
      if (!activeId) return;
      setFlowCategory(d.templateCategory ?? undefined);
      updateDraft(activeId, d);
      // The service date lives in the flow draft's free-text fields (whatever
      // form asked for it — the "service" template or the announcement's
      // "yes, I have them" branch); persist it onto the session itself so it
      // survives past this one draft and can anchor contact retention (see
      // getContactsRetentionExpiry) even after the draft is reset.
      const serviceDate = d.fields['serviceDate']?.trim();
      if (serviceDate && serviceDate !== active?.serviceDate) {
        updateSession(activeId, { serviceDate });
      }
    },
    [activeId, updateDraft, updateSession, active?.serviceDate],
  );

  // Retention: the saved contact list is cleared 30 days past the latest
  // known service date across all sessions (the family may still want it
  // right up until the service is behind them) — see CONTACT_RETENTION_DAYS.
  useEffect(() => {
    if (contacts.loading || contacts.contacts.length === 0) return;
    const expiry = getContactsRetentionExpiry(sessions.sessions);
    if (expiry && Date.now() >= expiry.getTime()) {
      void contacts.clearAll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contacts.loading, sessions.sessions]);

  // The last person was handed the message: record who was told (for dedup and the path), then
  // open the path at once with a note. No timer (#176).
  function finishFlow({ category, deliveredIds, total }: FlowFinish) {
    if (!active) return;
    if (deliveredIds.length > 0) recordMomentComplete(active.id, category, deliveredIds);
    setFinishNote({ moment: MOMENT_BY_CATEGORY[category], told: deliveredIds.length, total });
    setFlowCategory(undefined);
    setView('pathLanding');
  }

  const activeDetails = useMemo<SessionDetails | null>(
    () =>
      active
        ? {
            personName: active.personName,
            dateOfPassing: active.dateOfPassing,
            senderName: active.senderName,
            obituaryUrl: active.obituaryUrl,
            obituaryPublisher: active.obituaryPublisher,
            // Only a service date that was actually shared may reach an announcement. A date
            // typed in a service draft that was never sent is not announced.
            serviceDate: active.momentCompletedAt?.service ? active.serviceDate : '',
          }
        : null,
    [active],
  );

  // With no one open, the path has nobody to show: go to Home instead.
  const goToPathLanding = useCallback(() => {
    setView(active ? 'pathLanding' : 'home');
  }, [active]);

  /**
   * Flag off: Home. Flag on there is no Home: the open person's Overview, or "Your people" with
   * nobody open. Used by Back from the account screens and the setup exit.
   */
  function goHome() {
    if (!CMS_ENABLED) {
      setView('home');
      return;
    }
    if (active) {
      go({ view: 'cms', person: active, section: 'overview' });
      return;
    }
    go({ view: 'people' });
  }

  /** Makes this person the active one and opens their path. A half-written message shows "Started" there (#25). */
  function openPerson(id: string, options?: { replace?: boolean }) {
    const person = sessions.sessions.find((s) => s.id === id);
    if (!person) return;
    setCreating(false);
    sessions.touchSession(id);
    setFlowCategory(undefined);
    if (CMS_ENABLED) {
      go({ view: 'cms', person, section: 'overview' }, options);
      return;
    }
    setActiveId(id);
    setView('pathLanding');
  }

  function startSetup() {
    const created = sessions.createSession();
    setActiveId(created.id);
    setSetupEditing(false);
    setView('setup');
  }

  const creatingNow = useRef(false);
  useEffect(() => {
    creatingNow.current = false;
  }, [view, location.key]);

  /** "Create a new one" on Home: setup first, then the rest of the walk. */
  function startNewSession() {
    if (CMS_ENABLED) {
      // One tap makes one person, even if a second tap lands before the screen changes.
      if (creatingNow.current) {
        return;
      }
      creatingNow.current = true;
      setArrivedQuietly(false);
      setArrivalNote('');
      // The editor has no contacts step or who-hears-first: make the person and open The person, from any page.
      const created = sessions.createSession();
      go({ view: 'cms', person: created, section: 'person' });
      return;
    }
    setCreating(true);
    setContactDraft({ name: '', phone: '', hearsFirst: false });
    setFirstTicks(null);
    startSetup();
  }

  /** Contacts only when this device has none; the check reads the local store, never the network. */
  function continueAfterSetup() {
    const hasContacts = contacts.contacts.length > 0;
    setContactsSkipped(hasContacts);
    setView(hasContacts ? 'whoHearsFirst' : 'addContactsManual');
  }

  function finishSetup() {
    if (!creating || setupEditing) {
      goToPathLanding();
      return;
    }
    if (contacts.loading) {
      setView('checkContacts'); // waits for the local load, then continues below
    } else {
      continueAfterSetup();
    }
  }

  useEffect(() => {
    if (view === 'checkContacts' && !contacts.loading) continueAfterSetup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, contacts.loading]);

  // If the local read never answers, carry on as if there are no contacts rather than hold
  // anyone on a loading screen (C5 spirit: nothing in the flow waits on something slow).
  useEffect(() => {
    if (view !== 'checkContacts') return;
    const timer = setTimeout(continueAfterSetup, CONTACTS_CHECK_FALLBACK_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  function backToSetup() {
    setSetupEditing(false);
    setView('setup');
  }

  function backFromWhoHearsFirst() {
    if (contactsSkipped) backToSetup();
    else setView('addContactsManual');
  }

  function saveWhoHearsFirst(firstIds: string[]) {
    const firstSet = new Set(firstIds);
    for (const c of contacts.contacts) {
      contacts.setTier(c.contactId, firstSet.has(c.contactId) ? 'first' : 'family');
    }
    // The person was made at "Create a new one"; carry on to their path.
    setCreating(false);
    setFirstTicks(null);
    setView('pathLanding');
  }

  function backFromSetup() {
    if (setupEditing) {
      setView(setupReturn.current);
      return;
    }
    setCreating(false);
    sessions.pruneEmpty();
    // The pruned person was the active one; clear it so a remaining person can be picked.
    setActiveId(null);
    goHome();
  }

  /**
   * Opens a moment's flow. Its own draft resumes if it is in progress; otherwise it starts fresh.
   * Only this moment's draft is touched, so another moment half done is never overwritten.
   */
  function openMoment(category: TemplateCategory, fresh: SendFlowDraft) {
    if (!active) return;
    const saved = active.drafts[category];
    const draft = hasDraftInProgress(saved) ? resumeDraft(saved) : fresh;
    if (draft !== saved) sessions.updateDraft(active.id, draft);
    setFlowCategory(category);
    setView('flow');
  }

  function startMoment(key: MomentKey) {
    if (!active) return;
    if (key === 'announce') {
      openMoment('announcement', freshDraft({ templateCategory: 'announcement', step: 'announce' }));
      return;
    }
    if (key === 'service') {
      if (active.serviceReady || hasDraftInProgress(active.drafts.service)) {
        openMoment('service', freshDraft({ templateCategory: 'service', step: 'details' }));
      } else {
        setView('gate');
      }
      return;
    }
    if (key === 'obituary') {
      setView('shareObituary');
      return;
    }
    // thanks starts on its details form.
    openMoment('aftercare', freshDraft({ templateCategory: 'aftercare', step: 'details' }));
  }

  /** "Edit person" on the path or on a form. Back returns to where it was opened; Continue always goes to the path. */
  function editPerson(from: AppView) {
    setupReturn.current = from;
    setSetupEditing(true);
    setView('setup');
  }

  function openCmsItem(id: ChecklistItemId, region: 'main' | 'panel' | 'sheet', target: Spot, closeSheet?: () => void) {
    // A second item opened while one is open replaces its entry, so one Back still returns to the page the
    // first one was opened from, and focus goes to the first opener.
    const replacing = cmsItem !== null;
    // The first opener keeps focus on return; an item that came from a link had none, so this one is it.
    if (!replacing || itemOpener.current === null) {
      itemOpener.current = { id, region };
    }
    // Same update as the item opening, so the sheet does not return focus after the heading took it.
    closeSheet?.();
    // The entry this opens is marked as ours: closing it can go Back to the page it came from (see closeCmsItem).
    go({ ...target, item: id }, replacing ? { replace: true, mark: openedHere(location.state) } : { mark: true });
  }

  /** Back to the page this item was opened from. Once, however many times it is tapped. */
  function backToOpener(): void {
    if (closing.current) {
      return;
    }
    // Nothing behind this entry (React Router's `idx` is 0): go to the Overview instead of a Back that goes nowhere.
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx <= 0) {
      go({ ...here, section: 'overview', item: null }, { replace: true });
      return;
    }
    // Cleared only when the router commits the new entry (the [location.key] effect), however slow that is.
    closing.current = true;
    navigate(-1);
  }

  function closeCmsItem() {
    if (closing.current) {
      return;
    }
    restoreOpener.current = true;
    // Opened here (a push of ours, marked in its state, also after a reload): Back is exact, the page and its
    // place return as they were. A link has no page of ours behind it, so it goes to the Overview and takes the item's entry.
    if (openedHere(location.state)) {
      backToOpener();
      return;
    }
    go({ ...here, section: 'overview', item: null }, { replace: true });
  }

  // The focus hook above treats start-up moves as "the initial screen" and leaves focus alone; a landing
  // is a real move to a new screen, so it asks for the h1 itself.
  const focusAfterLanding = useRef(false);
  // The latest openPerson and go (re-made each render), so the effect below needn't list them.
  const opens = useRef({ openPerson, go });
  opens.current = { openPerson, go };
  // Editor on: once per load (and again after a sign-out), `/` and the sign-in paths are replaced by the
  // most recent person's Overview, or the empty Overview when nobody is saved (#448, #603). A deep link,
  // or an entry this app stored (a reload), wins over the landing. Starting a person is always the user's choice.
  useEffect(() => {
    if (signedOut) {
      landed.current = false;
      setSyncWaitOver(false);
    }
    if (!CMS_ENABLED || landed.current || !isSignedIn || auth?.isLoading || baseView !== 'home') {
      return;
    }
    // A deep link to a person's page, Your people or Your account wins over the landing.
    if (personPath || peoplePath || accountPath) {
      landed.current = true;
      return;
    }
    if (!LANDING_PATHS.includes(location.pathname)) {
      return;
    }
    if (sortedSessions.length === 0 && waitingForSync) {
      return;
    }
    landed.current = true;
    focusAfterLanding.current = true;
    if (sortedSessions.length > 0) {
      opens.current.openPerson(sortedSessions[0].id, { replace: true });
      return;
    }
    // Nobody saved: the Overview's empty page, not Your people.
    opens.current.go({ view: 'noOne', section: 'overview' }, { replace: true });
  });

  // One boolean, so the list changing while it stays true does not restart the cap.
  const mayArrive = sortedSessions.length === 0 || personMissing;
  useEffect(() => {
    // Any screen: a stalled pull must still end the wait, so creation is never held back for good.
    // A person's page that is not here yet waits the same cap.
    if (!waitingForSync || !isSignedIn || !mayArrive) {
      return;
    }
    const timer = setTimeout(() => setSyncWaitOver(true), LANDING_SYNC_WAIT_MS);
    return () => clearTimeout(timer);
  }, [waitingForSync, isSignedIn, mayArrive]);
  // While the first pull may still bring people, offering "Start" could make a second copy of one.
  const creationHeld = waitingForSync && sortedSessions.length === 0;

  // First sign-in with an account that has no name: fill it from the Clerk user (given and family
  // name) in one save. The server sets the sender name from the first name. It is tried once per
  // user on this device and never overwrites a name that exists; a failed save is silent (C5), and
  // Overview shows a note that leads to Account.
  const prefilling = useRef(false);
  const updateDetails = auth?.updateDetails;
  const profileAnswered = auth?.profileAnswered ?? false;
  // Only a live answer from the server: a cache or a failed load must never trigger a save.
  const profileLoaded = auth?.profileLoaded ?? false;
  // True while the background save runs, so the note never flashes and then unmounts under focus.
  const [prefillState, setPrefillState] = useState<'idle' | 'pending' | 'done'>('idle');
  const knownProfile = auth?.profile ?? null;
  const userId = auth?.userId;
  useEffect(() => {
    if (!CMS_ENABLED || !signedIn || offline || !userId || !profileLoaded || !updateDetails || prefilling.current) {
      return;
    }
    if (wasPrefilled(window.localStorage, userId)) {
      return;
    }
    const names = namesToPrefill(knownProfile, clerkNames);
    if (!names) {
      return;
    }
    prefilling.current = true;
    setPrefillState('pending');
    void updateDetails(names, { quiet: true })
      .then((result) => {
        if (result.ok) {
          markPrefilled(window.localStorage, userId);
        }
      })
      .catch(() => undefined)
      .finally(() => setPrefillState('done'));
  }, [signedIn, offline, userId, profileLoaded, updateDetails, knownProfile, clerkNames]);
  // Signed out: the next sign-in (maybe another user) may fill its own names.
  useEffect(() => {
    if (signedOut) {
      prefilling.current = false;
      setPrefillState('idle');
    }
  }, [signedOut]);

  // Armed by the landing. Fires once on the first editor render, then disarms (even with no h1). If the
  // landing is interrupted (another screen shows first), it disarms so it can't fire on a later visit.
  useEffect(() => {
    if (!focusAfterLanding.current) {
      return;
    }
    if (view === 'cms' || view === 'people' || view === 'noOne') {
      focusAfterLanding.current = false;
      const heading = document.querySelector('h1');
      if (heading) {
        heading.setAttribute('tabindex', '-1');
        heading.focus();
      }
    } else if (view !== 'home') {
      focusAfterLanding.current = false;
    }
  });

  /**
   * The "What you'll need" panel for the screens around the editor (people, account, loading). With a
   * person it is their checklist; with none it is a read-only preview, so the panel never vanishes (#584, #597).
   */
  function panelFor(person: Session | null) {
    if (!person) {
      // Nobody saved: the same phases and items as a preview, with no ticks to keep.
      return ({ inSheet, closeSheet }: { inSheet: boolean; closeSheet: () => void }) => (
        <ChecklistPanel
          preview={canCreate ? 'owner' : 'member'}
          checklist={{}}
          onSetItem={() => undefined}
          currentItem={view === 'noOne' ? cmsItem : null}
          onOpenItem={(id) => {
            auth?.clearError();
            setAskingName(false);
            // A push: Back is the browser's, so it returns to the screen the panel was used on.
            openCmsItem(id, inSheet ? 'sheet' : 'panel', { view: 'noOne', section: view === 'noOne' ? cmsSection : 'overview' }, closeSheet);
          }}
        />
      );
    }
    return ({ inSheet, closeSheet }: { inSheet: boolean; closeSheet: () => void }) => (
      <ChecklistPanel
        checklist={person.checklist ?? {}}
        onSetItem={(id, state) => sessions.setChecklistItem(person.id, id, state)}
        currentItem={null}
        onOpenItem={(id) => {
          auth?.clearError();
          setAskingName(false);
          sessions.touchSession(person.id);
          // A push: Back is the browser's, so it returns to Your people or Your account.
          openCmsItem(id, inSheet ? 'sheet' : 'panel', { view: 'cms', person, section: 'overview' }, closeSheet);
        }}
      />
    );
  }

  /** The people list inside the shell. Flag on, this is also the fallback, so the old Home never renders. */
  function renderPeople() {
    // The open person, else the most recent one; with nobody at all the pages are the empty ones.
    const person = active ?? sortedSessions[0] ?? null;
    const noPerson = person === null;
    return (
      <Shell wide>
        <CmsShell
          title={cmsShellCopy.peopleTitle}
          nobody={noPerson}
          aside={panelFor(person)}
          personName={person?.personName ?? ''}
          section="people"
          statuses={person?.sectionStatus}
          hrefFor={navHref(person)}
          // Your people is already here; a section opens that person there, like the Overview card.
          onSelect={(key) => {
            // CmsShell routes 'people' and 'account' to their own handlers; the extra checks only narrow the type.
            if (key === 'account' || key === 'people') {
              return;
            }
            if (!person) {
              openEmpty(key);
              return;
            }
            auth?.clearError();
            setAskingName(false);
            sessions.touchSession(person.id);
            go({ view: 'cms', person, section: key });
          }}
          // Your people is already open.
          onPeople={() => undefined}
          onAccount={() => {
            moveThenPrune(() => openAccount());
          }}
          notice={endedNote}
        >
          {entry.missing ? (
            <p className="m-0 text-[14px]" style={{ color: 'var(--text-muted)' }}>
              {cmsShellCopy.personMissing}
            </p>
          ) : null}
          <PeopleList sessions={sessionList} onOpen={openPerson} onCreate={() => startNewSession()} canCreate={canCreate} holding={creationHeld} />
        </CmsShell>
      </Shell>
    );
  }

  /** Back from Settings or Your account (flag off; with the editor on the browser's Back does this). */
  function backFromAccount() {
    goHome();
  }

  /** Saves the personal details. The name prompt is done once they are saved: back to where the person was. */
  async function saveDetails(details: PersonalDetails) {
    const result = await auth?.updateDetails(details);
    if (!result) {
      return { ok: false, invalid: false } as const;
    }
    if (result.ok && askingName) {
      setAskingName(false);
      setView(returnTo);
    }
    return result;
  }

  /**
   * Your account inside the editor shell (flag on). The shell owns the one h1. There is no Back: the
   * side nav leads out, and it looks the same with or without a person.
   */
  function renderAccount(title: string, body: ReactNode) {
    // The open person, else the most recent one; with nobody at all the pages are the empty ones.
    const person = active ?? sortedSessions[0] ?? null;
    const noPerson = person === null;
    return (
      <Shell wide>
        <CmsShell
          title={title}
          nobody={noPerson}
          aside={panelFor(person)}
          personName={person?.personName ?? ''}
          section="account"
          statuses={person?.sectionStatus}
          hrefFor={navHref(person)}
          onSelect={(key) => {
            if (key !== 'account' && key !== 'people') {
              if (!person) {
                openEmpty(key);
                return;
              }
              auth?.clearError();
              setAskingName(false);
              if (person.id !== active?.id) {
                sessions.touchSession(person.id);
              }
              go({ view: 'cms', person, section: key });
            }
          }}
          onPeople={() => {
            auth?.clearError();
            setAskingName(false);
            leaveCms();
          }}
          // Already here.
          onAccount={() => undefined}
          notice={endedNote}
        >
          {body}
        </CmsShell>
      </Shell>
    );
  }

  // The note waits while the save runs, and from the moment the names are due until it starts, so it never flashes.
  const prefillHolds =
    prefillState === 'pending' ||
    (prefillState === 'idle' && profileLoaded && !!userId && !wasPrefilled(window.localStorage, userId) && namesToPrefill(knownProfile, clerkNames) !== null);
  /** The line on Overview when the account has no first name: a link to Account. */
  const nameNote =
    CMS_ENABLED && signedIn && profileAnswered && !prefillHolds && lacksFirstName(knownProfile) ? (
      <NameNote
        onOpenAccount={() => {
          openProfile(false);
        }}
      />
    ) : null;

  /** A section or the Overview with nobody saved: one calm page and one next step. */
  function openEmpty(section: CmsSection) {
    auth?.clearError();
    setAskingName(false);
    go({ view: 'noOne', section });
  }

  /** "Your people" in the side nav: an unnamed person is dropped, then Your people opens. */
  function leaveCms() {
    moveThenPrune(() => go({ view: 'people' }));
  }

  if (notFound) {
    return <NotFound />;
  }

  if (guardTo !== null) {
    return <Navigate to={guardTo} replace />;
  }

  // While Clerk is loading or a stored session is being checked, show nothing but the quiet status.
  if (auth?.isLoading) {
    return (
      <Shell>
        <Loading />
      </Shell>
    );
  }

  // ---- Flow D: account + contacts onboarding ----

  if (auth && SignInScreen && view === 'signIn') {
    return (
      <Shell notice={endedNote}>
        <SignInScreen />
      </Shell>
    );
  }

  if (CMS_ENABLED && auth && view === 'profile') {
    return renderAccount(
      accountCopy.title,
      <AccountSection
        asksName={false}
        senderName={auth.profile?.senderName ?? null}
        firstName={auth.profile?.firstName ?? null}
        lastName={auth.profile?.lastName ?? null}
        birthDate={auth.profile?.birthDate ?? null}
        address={auth.profile?.address ?? null}
        profileLoaded={auth.profileAnswered}
        onSaveDetails={saveDetails}
        error={auth.error}
        email={accountEmail}
        onManageSignIn={openAccountSettings}
        onDeleteAccount={
          deleteAccount && onDeleted
            ? async () => {
                setDeletingAccount(true);
                try {
                  const cleared = await deleteAccountThenClear(deleteAccount, window.localStorage);
                  onDeleted(cleared);
                } catch (error) {
                  setDeletingAccount(false);
                  throw error;
                }
              }
            : undefined
        }
        plans={sortedSessions}
        removePerson={removePersonPanel}
        peopleHelping={
          sharingOn ? (
            <PeopleHelping
              view={members.view}
              status={members.status}
              message={members.message}
              onInvite={members.invite}
              onRevoke={members.revoke}
            />
          ) : undefined
        }
        onSignOut={() => {
          accountGeneration.current += 1;
          setLeftOnPurpose(true);
          setCreating(false);
          void auth.signOut();
        }}
        settings={{
          removeMember:
            sharingOn && members.view?.role === 'owner' ? (
              <RemoveMember members={members.view.members} message={members.message} onRemove={members.remove} headingLevel={3} />
            ) : undefined,
        }}
      />,
    );
  }

  if (auth && view === 'profile') {
    return (
      <Shell notice={endedNote}>
        <Profile
          asksName={askingName}
          senderName={auth.profile?.senderName ?? null}
          firstName={auth.profile?.firstName ?? null}
          lastName={auth.profile?.lastName ?? null}
          birthDate={auth.profile?.birthDate ?? null}
          address={auth.profile?.address ?? null}
          onSaveDetails={saveDetails}
          error={auth.error}
          showChecklist={auth.isSignedIn}
          peopleHelping={
            sharingOn ? (
              <PeopleHelping
                view={members.view}
                status={members.status}
                message={members.message}
                onInvite={members.invite}
                onRevoke={members.revoke}
              />
            ) : undefined
          }
          onBack={() => {
            auth.clearError();
            setAskingName(false);
            if (askingName) {
              setView(returnTo);
            } else {
              backFromAccount();
            }
          }}
          onSave={async (name) => {
            const saved = await auth.updateSenderName(name);
            if (saved && askingName) {
              setAskingName(false);
              setView(returnTo);
            }
            return saved;
          }}
          onSignOut={() => {
            accountGeneration.current += 1;
            setLeftOnPurpose(true);
            setCreating(false);
            void auth.signOut();
          }}
        />
      </Shell>
    );
  }

  if (view === 'cms' && active) {
    const readyChange = (key: SectionKey) => (ready: boolean) =>
      sessions.setSectionStatus(active.id, key, ready ? 'ready' : 'in_progress');
    const nextSection = computeSections(active, AVAILABLE_SECTIONS).next;
    // Ready leads on: the next section, or the Overview when nothing is left. The key hook moves focus to the h1.
    const toSection = (section: CmsSection) => go({ view: 'cms', person: active, section });
    const goNext = () => toSection(nextSection ?? 'overview');
    return (
      <Shell wide>
        <CmsShell
          title={cmsItem ? cmsItemLabels[cmsItem] : undefined}
          syncOn={syncOn}
          aside={({ inSheet, closeSheet }) => (
            <ChecklistPanel
              checklist={active.checklist ?? {}}
              onSetItem={(id, state) => sessions.setChecklistItem(active.id, id, state)}
              currentItem={cmsItem}
              onOpenItem={(id) => openCmsItem(id, inSheet ? 'sheet' : 'panel', here, closeSheet)}
            />
          )}
          personName={active.personName}
          section={cmsSection}
          statuses={active.sectionStatus}
          hrefFor={navHref(active)}
          // The account item goes to onAccount, never here; the check only narrows the type.
          onSelect={(key) => {
            if (key !== 'account' && key !== 'people') {
              toSection(key);
            }
          }}
          onPeople={leaveCms}
          onAccount={() => {
            moveThenPrune(() => openAccount());
          }}
          notice={endedNote}
        >
          {cmsItem ? (
            <ChecklistItemDetail
              itemId={cmsItem}
              state={active.checklist?.[cmsItem] ?? null}
              onSetState={(state) => sessions.setChecklistItem(active.id, cmsItem, state)}
              onBack={closeCmsItem}
              // The key hook moves focus to the section's h1.
              onOpenSection={toSection}
            />
          ) : cmsSection === 'overview' ? (
            <>
              {nameNote}
              <Overview
                session={active}
                checklist={active}
                onOpen={toSection}
                onOpenItem={(id) => openCmsItem(id, 'main', here)}
              />
            </>
          ) : cmsSection === 'person' ? (
            <PersonSection
              values={active}
              onChange={(patch) => sessions.updateSection(active.id, 'person', patch)}
              onReadyChange={readyChange('person')}
              nextSection={nextSection}
              onNext={goNext}
            />
          ) : cmsSection === 'service' ? (
            <ServiceSection
              values={active}
              onChange={(patch) => sessions.updateSection(active.id, 'service', patch)}
              onReadyChange={readyChange('service')}
              nextSection={nextSection}
              onNext={goNext}
            />
          ) : cmsSection === 'announcement' ? (
            <AnnouncementSection
              values={active}
              onChange={(patch) => sessions.updateSection(active.id, 'announcement', patch)}
              onReadyChange={readyChange('announcement')}
              nextSection={nextSection}
              onNext={goNext}
            />
          ) : cmsSection === 'obituary' ? (
            <ObituarySection
              key={active.id}
              values={active}
              onChange={(patch) => sessions.updateSection(active.id, 'obituary', patch)}
              onServiceChange={(patch) => sessions.updateSection(active.id, 'service', patch)}
              onPersonChange={(patch) => sessions.updateSection(active.id, 'person', patch)}
              onReadyChange={readyChange('obituary')}
              nextSection={nextSection}
              onNext={goNext}
            />
          ) : (
            <ThanksSection
              values={active}
              onChange={(patch) => sessions.updateSection(active.id, 'thanks', patch)}
              onReadyChange={readyChange('thanks')}
              nextSection={nextSection}
              onNext={goNext}
            />
          )}
        </CmsShell>
      </Shell>
    );
  }

  if (CMS_ENABLED && view === 'settings') {
    return renderAccount(
      accountCopy.title,
      <AccountSettingsSection
        removePerson={removePersonPanel}
        removeMember={
          sharingOn && members.view?.role === 'owner' ? (
            <RemoveMember members={members.view.members} message={members.message} onRemove={members.remove} />
          ) : undefined
        }
      />,
    );
  }

  if (view === 'settings') {
    return (
      <Shell notice={endedNote}>
        <Settings
          onBack={backFromAccount}
          onRemoveEverything={removeEverything}
          signsOut={offline || (auth?.isSignedIn ?? false)}
          removeMember={
            sharingOn && members.view?.role === 'owner' ? (
              <RemoveMember members={members.view.members} message={members.message} onRemove={members.remove} />
            ) : undefined
          }
        />
      </Shell>
    );
  }

  if (view === 'addContactsManual') {
    return (
      <Shell notice={endedNote}>
        <AddContactsManual
          contacts={contacts.contacts}
          onBack={backToSetup}
          onAdd={({ name, phone, hearsFirst }) =>
            contacts.addContact({ name, phone, tier: hearsFirst ? 'first' : 'family' })
          }
          onDone={() => {
                    setView('whoHearsFirst');
          }}
          draft={contactDraft}
          onDraftChange={setContactDraft}
        />
      </Shell>
    );
  }

  if (view === 'checkContacts') {
    return (
      <Shell notice={endedNote}>
        <Loading />
      </Shell>
    );
  }

  if (view === 'whoHearsFirst') {
    return (
      <Shell notice={endedNote}>
        <WhoHearsFirst
          contacts={contacts.contacts}
          onBack={backFromWhoHearsFirst}
          onSave={saveWhoHearsFirst}
          initialFirstIds={firstTicks}
          onTicksChange={setFirstTicks}
        />
      </Shell>
    );
  }

  // ---- Standalone views ----

  if (view === 'obituary') {
    return (
      <Shell notice={endedNote}>
        <ObituaryScreen
          session={activeDetails}
          onBack={() => setView('shareObituary')}
          onDone={() => setView('shareObituary')}
        />
      </Shell>
    );
  }

  if (view === 'gate' && active) {
    return (
      <Shell notice={endedNote}>
        <Gate
          title="Have the arrangements been made?"
          subtitle="This message needs a date, time and place from the funeral home."
          notYet={{ title: 'Not yet', body: "We'll check back tomorrow. Nothing is late." }}
          ready={{ title: "Yes, we've set a date", body: "Let's tell people when and where." }}
          reassurance="Most families take three or four days to get this far. You're not behind."
          onBack={() => goToPathLanding()}
          onChoose={(ready) => {
            if (ready) {
              sessions.setServiceReady(active.id, true);
              openMoment('service', freshDraft({ templateCategory: 'service', step: 'details' }));
            } else {
              const dueAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
              sessions.scheduleReminder(active.id, 'service', dueAt);
              goToPathLanding();
            }
          }}
        />
      </Shell>
    );
  }

  if (view === 'shareObituary' && active && activeDetails) {
    return (
      <Shell notice={endedNote}>
        <ShareObituary
          session={activeDetails}
          onBack={() => goToPathLanding()}
          onChange={(patch) => sessions.updateSession(active.id, patch)}
          onContinue={() => {
            openMoment(
              'obituary',
              freshDraft({ templateCategory: 'obituary', templateOverrideId: 'obituary-link', step: 'contacts' }),
            );
          }}
          onDraft={() => setView('obituary')}
        />
      </Shell>
    );
  }

  if (view === 'setup' && active) {
    return (
      <Shell notice={endedNote}>
        <SessionSetup
          session={active}
          editing={setupEditing}
          onChange={(patch) => sessions.updateSession(active.id, patch)}
          onContinue={finishSetup}
          onBack={backFromSetup}
        />
      </Shell>
    );
  }

  if (view === 'flow' && active && activeDetails) {
    // A send under way or finished is never reopened from Home. If the flow is mounted again
    // mid-send or at Sent (a prompt came between), the moment keeps its place (#167): mid-send
    // comes back on Review (the send job is not saved), Sent stays Sent. A sent draft holds no
    // wording (C2). With nothing to show, the flow sends the person back to the path.
    const chosen = flowCategory ? active.drafts[flowCategory] : null;
    const latest = latestInProgressDraft(active);
    const sendingOrSent = chosen?.step === 'sending' || chosen?.step === 'sent';
    const flowStart =
      flowCategory === undefined
        ? latest && resumeDraft(latest)
        : sendingOrSent || hasDraftInProgress(chosen)
          ? chosen
          : null;
    return (
      <Shell notice={endedNote}>
        <Flow
          key={active.id}
          session={activeDetails}
          draft={flowStart}
          drafts={active.drafts}
          contacts={contacts.contacts}
          notifiedContactIds={active.recipientsNotified.announcement ?? []}
          onDraftChange={onDraftChange}
          onExitToLanding={goToPathLanding}
          onFinished={finishFlow}
          onEditSession={() => editPerson('flow')}
          onAddContact={({ name, phone }) => contacts.addContact({ name, phone, tier: 'family' })}
        />
      </Shell>
    );
  }

  if (view === 'pathLanding' && active) {
    return (
      <Shell notice={endedNote}>
        <PathLanding
          session={active}
          onBack={goHome}
          onStartMoment={startMoment}
          onEditPerson={() => editPerson('pathLanding')}
          note={finishNote}
          onCloseNote={() => setFinishNote(null)}
        />
      </Shell>
    );
  }

  // Landing is waiting for the first sync: a quiet status, not an empty "Your people" that then jumps.
  // A person's page that is not here yet waits the same way (the first pull may bring them).
  const landingWaits = view === 'home' && isSignedIn && !landed.current && waitingForSync && sortedSessions.length === 0;
  if (CMS_ENABLED && (landingWaits || (personMissing && waitingForSync))) {
    return (
      <Shell wide>
        <CmsShell
          title={cmsShellCopy.loadingTitle}
          nobody
          aside={panelFor(null)}
          noCurrent
          personName=""
          hrefFor={navHref(null)}
          section="people"
          onSelect={(key) => {
            if (key !== 'account' && key !== 'people') {
              openEmpty(key);
            }
          }}
          onPeople={() => go({ view: 'people' })}
          onAccount={() => openAccount()}
          notice={endedNote}
        >
          <Loading inShell />
        </CmsShell>
      </Shell>
    );
  }

  if (CMS_ENABLED && view === 'noOne') {
    return (
      <Shell wide>
        <CmsShell
          title={cmsItem ? cmsItemLabels[cmsItem] : undefined}
          nobody
          aside={panelFor(null)}
          personName=""
          section={cmsSection}
          hrefFor={navHref(null)}
          onSelect={(key) => {
            if (key !== 'account' && key !== 'people') {
              go({ view: 'noOne', section: key });
            }
          }}
          onPeople={() => go({ view: 'people' })}
          onAccount={() => openAccount()}
          notice={endedNote}
        >
          {cmsItem ? (
            <ChecklistItemDetail
              readOnly
              itemId={cmsItem}
              state={null}
              onSetState={() => undefined}
              onBack={closeCmsItem}
              onOpenSection={(section) => go({ view: 'noOne', section })}
            />
          ) : (
            <>
              {cmsSection === 'overview' ? nameNote : null}
              <EmptySection canCreate={canCreate} holding={creationHeld} onCreate={() => startNewSession()} />
            </>
          )}
        </CmsShell>
      </Shell>
    );
  }

  // Home is also the fallback: a view with nobody open (the path, a flow) never shows a blank screen.
  // Flag on there is no Home at all: 'people', the pre-landing 'home', and any view that lost its person
  // for one render all show "Your people".
  if (CMS_ENABLED) {
    return renderPeople();
  }
  return (
    <Shell notice={endedNote}>
      <Home
        sessions={sessionList}
        onOpen={openPerson}
        onCreate={() => startNewSession()}
        // Only a known member loses the button; an unknown or offline profile keeps it, and the
        // database still refuses a member's insert (C11).
        canCreate={canCreate}
        // "Your account" shows the list whenever its button shows; otherwise Home keeps the link.
        checklistLink={!(auth && !sessionEnded)}
      />
      <div className="flex flex-col items-start gap-2 mt-4">
        {auth && !sessionEnded && (
          <button type="button" onClick={() => openProfile(false)} className="gg-btn gg-btn-ghost !px-0">
            Your account
          </button>
        )}
        <button type="button" onClick={() => setView('settings')} className="gg-btn gg-btn-ghost !px-0">
          Settings
        </button>
      </div>
    </Shell>
  );
}

export default App;
