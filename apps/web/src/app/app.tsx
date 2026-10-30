import { useFocusHeadingOnChange } from '../lib/ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  useContacts,
  useSessions,
  useMembers,
  freshDraft,
  getContactsRetentionExpiry,
  hasDraftInProgress,
  resumeDraft,
  namedSessionsByRecent,
  latestInProgressDraft,
} from '@griever/hooks';
import type { Session, SendFlowDraft, UseAccountResult } from '@griever/hooks';
import { getProfile } from '@griever/api-client';
import type { ProfileResult } from '@griever/api-client';
import type { ChecklistItemId, MomentKey, SessionDetails, TemplateCategory } from '@griever/shared';
import { contactStore } from '@griever/data-local';
import { screenCopy } from '@griever/copy';
import { AUTH_ENABLED, SHARING_ENABLED } from '../lib/features';
import { CMS_ENABLED } from '../lib/cmsFlag';
import { CmsShell } from '../cms/CmsShell';
import { Overview } from '../cms/Overview';
import { ChecklistPanel } from '../cms/checklist/ChecklistPanel';
import { ChecklistItemDetail } from '../cms/checklist/ChecklistItemDetail';
import { PersonSection } from '../cms/sections/PersonSection';
import { ServiceSection } from '../cms/sections/ServiceSection';
import type { CmsNavKey } from '../cms/SideNav';
import { hasSignedInMarker, loadClerk } from '../lib/authClient';
import type { ClerkAccountReady, ClerkLoadResult, ClerkModules } from '../lib/authClient';
import { Profile } from '../screens/Profile';
import { Settings } from '../screens/Settings';
import { PeopleHelping } from '../screens/PeopleHelping';
import { RemoveMember } from '../screens/RemoveMember';
import { removeEverythingFromDevice } from '../lib/removeFromDevice';
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
  | 'cms';

/** The editor's sections; the account is a separate view, so it is never a section. */
type CmsSection = Exclude<CmsNavKey, 'account'>;

const cmsShellCopy = screenCopy('cmsShell');
const cmsItemLabels = screenCopy('cmsChecklist').items;

const MOMENT_BY_CATEGORY: Record<TemplateCategory, MomentKey> = {
  announcement: 'announce',
  service: 'service',
  obituary: 'obituary',
  aftercare: 'thanks',
};

const browserStorage =
  typeof window !== 'undefined' ? window.localStorage : undefined;

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
      <div className={wide ? 'w-full max-w-6xl px-5 pb-8' : 'w-full max-w-[420px] px-5 py-8'}>
        {notice}
        {children}
      </div>
    </div>
  );
}

/** An always-present status region; the words appear only after a pause, so a quick load never flashes. */
function Loading() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setShow(true), 500);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div role="status" className="text-[14px] pt-[52px]" style={{ color: 'var(--text-muted)' }}>
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
          SignInScreen={SignInScreen}
          removed={removed}
          onRemoved={onRemoved}
        />
      )}
    </AuthGate>
  );
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

function isAccountView(view: AppView): boolean {
  return view === 'signIn';
}

function AppBody({
  auth,
  getAccessToken,
  endSession,
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
  SignInScreen?: ClerkModules['SignInScreen'];
  /** Signed in on this device, but accounts can't be reached: local work only. */
  offline?: boolean;
}) {
  const contacts = useContacts(contactStore);
  const sessions = useSessions(browserStorage);
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

  const [view, setView] = useState<AppView>(() => {
    if (offline) return 'home';
    if (AUTH_ENABLED) return 'signIn';
    // Home is always the first screen, with or without people (A2b); contacts come later in the walk.
    return 'home';
  });
  const firstView = useRef(view);
  // Shown once, on the first screen after a removal; leaving it ends it for good.
  const [showRemoved, setShowRemoved] = useState(removed);
  useEffect(() => {
    if (view !== firstView.current) setShowRemoved(false);
  }, [view]);
  const [activeId, setActiveId] = useState<string | null>(null);
  // Which moment's draft the flow opens with. Undefined (a returning visit) means the one
  // changed most recently.
  const [flowCategory, setFlowCategory] = useState<TemplateCategory | undefined>(undefined);
  const [setupEditing, setSetupEditing] = useState(false);
  // Which section the editor shows (flag on only).
  const [cmsSection, setCmsSection] = useState<CmsSection>('overview');
  // The checklist item whose guidance fills the editor's main column (flag on only).
  const [cmsItem, setCmsItem] = useState<ChecklistItemId | null>(null);
  // Where the open item was opened from, so Back can return to that button.
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
  const [returnTo, setReturnTo] = useState<AppView>('home');
  // Set by the Sign out button, so only that (not a session that ended elsewhere) leaves the screen.
  const [leftOnPurpose, setLeftOnPurpose] = useState(false);

  const signedIn = auth?.isSignedIn ?? false;
  const signedOut = auth !== null && !auth.isLoading && !auth.isSignedIn;
  // The editor's sections share one view, so the section is part of the key: a change moves focus to the h1.
  useFocusHeadingOnChange(view === 'cms' ? `cms:${cmsSection}:${cmsItem ?? ''}` : view);
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

  const openProfile = useCallback(
    (asksName: boolean, from: AppView = 'home') => {
      // A stale error from another screen would otherwise show here without being announced.
      clearError?.();
      setAskingName(asksName);
      setReturnTo(from);
      setNeedsName(false);
      setView('profile');
    },
    [clearError],
  );

  // Sign-in resolves asynchronously (the boot-time session check, or the Clerk form), so the
  // next view can't be decided in useState's initializer. Everyone lands on Home.
  useEffect(() => {
    if (!signedIn || !isAccountView(view)) return;
    setFlowCategory(undefined);
    setView('home');
    // Ask in the background whether the account has a name. It never holds anyone back, and it
    // clears a prompt left over from an earlier session.
    if (getAccessToken) {
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
    if (signedIn && needsName && !isAccountView(view) && view !== 'profile') openProfile(true, view);
  }, [signedIn, needsName, view, openProfile]);

  // No session, no prompt: it would be stale by the next sign-in.
  useEffect(() => {
    if (!signedOut) return;
    accountGeneration.current += 1;
    if (needsName) setNeedsName(false);
  }, [signedOut, needsName]);

  // Only the Sign out button sends the person back to sign-in. A session that ended some other
  // way keeps them where they are (C5), with a note.
  useEffect(() => {
    if (signedOut && leftOnPurpose && !isAccountView(view)) {
      setLeftOnPurpose(false);
      setFlowCategory(undefined);
      setView('signIn');
    }
  }, [signedOut, leftOnPurpose, view]);
  const sessionEnded = signedOut && !leftOnPurpose && !isAccountView(view);
  // One polite region that is always there, so the note is announced when its text appears.
  const signedOutNote = auth ? (
    <div role="status" aria-live="polite" className="text-[13px]">
      {sessionEnded && (
        <div className="flex flex-col gap-1 mb-4">
          <p className="m-0">You've been signed out. Your work on this device is safe. Sign in again when you're ready.</p>
          <button
            type="button"
            onClick={() => setView('signIn')}
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
  const endedNote = (
    <>
      {removedNote}
      {signedOutNote}
      <div role="status" aria-live="polite" className="sr-only">
        {finishAnnouncement}
      </div>
    </>
  );

  async function removeEverything() {
    // Local only: ending the Clerk session deletes nothing on a server.
    await removeEverythingFromDevice(window.localStorage, endSession);
    onRemoved();
  }

  const canCreate = !(sharingOn && auth?.profile?.accountType === 'member');
  const sortedSessions = useMemo(() => namedSessionsByRecent([...sessions.sessions]), [sessions.sessions]);

  // Picks the most recent person when none is open. It never creates one: Home's "Create a new
  // one" is the only way to start a person.
  useEffect(() => {
    if (!isSignedIn || activeId || sortedSessions.length === 0) return;
    setActiveId(sortedSessions[0].id);
  }, [isSignedIn, activeId, sortedSessions]);

  const active = useMemo<Session | null>(
    () => sessions.sessions.find((s) => s.id === activeId) ?? null,
    [sessions.sessions, activeId],
  );

  // With no one open these views have nothing to show, and Home stands in; keep the state honest.
  useEffect(() => {
    if (!active && NEEDS_PERSON.includes(view)) setView('home');
  }, [active, view]);

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

  function goHome() {
    setView('home');
  }

  /** Makes this person the active one and opens their path. A half-written message shows "Started" there (#25). */
  function openPerson(id: string) {
    const person = sessions.sessions.find((s) => s.id === id);
    if (!person) return;
    setCreating(false);
    sessions.touchSession(id);
    setActiveId(id);
    setFlowCategory(undefined);
    if (CMS_ENABLED) {
      setCmsSection('overview');
      setView('cms');
      return;
    }
    setView('pathLanding');
  }

  function startSetup() {
    const created = sessions.createSession();
    setActiveId(created.id);
    setSetupEditing(false);
    setView('setup');
  }

  /** "Create a new one" on Home: setup first, then the rest of the walk. */
  function startNewSession() {
    if (CMS_ENABLED) {
      // The editor has no contacts step or who-hears-first: make the person and open The person.
      const created = sessions.createSession();
      setActiveId(created.id);
      setCmsSection('person');
      setView('cms');
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

  function openCmsItem(id: ChecklistItemId, region: 'main' | 'panel' | 'sheet', closeSheet?: () => void) {
    itemOpener.current = { id, region };
    // Same update as the item opening, so the sheet does not return focus after the heading took it.
    closeSheet?.();
    setCmsItem(id);
  }

  function closeCmsItem() {
    restoreOpener.current = true;
    setCmsItem(null);
  }

  // Editor on: the first time the app reaches Home after load or sign-in, open the most recent person's
  // Overview, or The person for a new one. The ref makes it once per sign-in, so "Change" and Back from
  // Settings or Profile stay on Home. A known member with nobody shared yet (C11) stays on Home.
  const landed = useRef(false);
  // The focus hook above treats start-up moves as "the initial screen" and leaves focus alone; a landing
  // is a real move to a new screen, so it asks for the h1 itself.
  const focusAfterLanding = useRef(false);
  // The latest openPerson and startNewSession (re-made each render), so the effect below needn't list them.
  const opens = useRef({ openPerson, startNewSession });
  opens.current = { openPerson, startNewSession };
  const profileKnown = !sharingOn || !!auth?.profile;
  useEffect(() => {
    if (signedOut) landed.current = false;
    if (!CMS_ENABLED || landed.current || !isSignedIn || auth?.isLoading || view !== 'home') {
      return;
    }
    if (sortedSessions.length > 0) {
      landed.current = true;
      focusAfterLanding.current = true;
      opens.current.openPerson(sortedSessions[0].id);
      return;
    }
    // A member is only known once the profile has loaded; until then Home stays and we ask again.
    if (!profileKnown) {
      return;
    }
    landed.current = true;
    if (canCreate) {
      focusAfterLanding.current = true;
      opens.current.startNewSession();
    }
  }, [signedOut, isSignedIn, auth?.isLoading, view, sortedSessions, profileKnown, canCreate]);

  useEffect(() => {
    if (!focusAfterLanding.current || view !== 'cms') {
      return;
    }
    const heading = document.querySelector('h1');
    if (heading) {
      focusAfterLanding.current = false;
      heading.setAttribute('tabindex', '-1');
      heading.focus();
    }
  });

  /** "Change" in the editor: an unnamed person is dropped, then Home. */
  function leaveCms() {
    sessions.pruneEmpty();
    setCmsItem(null);
    setActiveId(null);
    goHome();
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

  if (auth && view === 'profile') {
    return (
      <Shell notice={endedNote}>
        <Profile
          asksName={askingName}
          senderName={auth.profile?.senderName ?? null}
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
            setView(askingName ? returnTo : 'home');
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
    const readyChange = (key: 'person' | 'service') => (ready: boolean) =>
      sessions.setSectionStatus(active.id, key, ready ? 'ready' : 'in_progress');
    return (
      <Shell wide>
        <CmsShell
          title={cmsItem ? cmsItemLabels[cmsItem] : undefined}
          aside={({ inSheet, closeSheet }) => (
            <ChecklistPanel
              checklist={active.checklist ?? {}}
              onSetItem={(id, state) => sessions.setChecklistItem(active.id, id, state)}
              currentItem={cmsItem}
              onOpenItem={(id) => openCmsItem(id, inSheet ? 'sheet' : 'panel', closeSheet)}
            />
          )}
          personName={active.personName}
          section={cmsSection}
          statuses={active.sectionStatus}
          // The account item goes to onAccount, never here; the check only narrows the type.
          onSelect={(key) => {
            if (key !== 'account') {
              setCmsItem(null);
              setCmsSection(key);
            }
          }}
          onChangePerson={leaveCms}
          onAccount={() => {
            sessions.pruneEmpty();
            setCmsItem(null);
            if (auth?.isSignedIn) {
              openProfile(false);
            } else {
              setView('settings');
            }
          }}
          notice={endedNote}
        >
          {cmsItem ? (
            <ChecklistItemDetail
              itemId={cmsItem}
              state={active.checklist?.[cmsItem] ?? null}
              onSetState={(state) => sessions.setChecklistItem(active.id, cmsItem, state)}
              onBack={closeCmsItem}
            />
          ) : cmsSection === 'overview' ? (
            <Overview
              session={active}
              checklist={active}
              onOpen={setCmsSection}
              onOpenItem={(id) => openCmsItem(id, 'main')}
            />
          ) : cmsSection === 'person' ? (
            <PersonSection
              values={active}
              onChange={(patch) => sessions.updateSection(active.id, 'person', patch)}
              onReadyChange={readyChange('person')}
            />
          ) : cmsSection === 'service' ? (
            <ServiceSection
              values={active}
              onChange={(patch) => sessions.updateSection(active.id, 'service', patch)}
              onReadyChange={readyChange('service')}
            />
          ) : (
            <p>{cmsShellCopy.comingLater}</p>
          )}
        </CmsShell>
      </Shell>
    );
  }

  if (view === 'settings') {
    return (
      <Shell notice={endedNote}>
        <Settings
          onBack={goHome}
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

  // Home is also the fallback: a view with nobody open (the path, a flow) never shows a blank screen.
  return (
    <Shell notice={endedNote}>
      <Home
        sessions={sessionList}
        onOpen={openPerson}
        onCreate={startNewSession}
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
