import { useFocusHeadingOnChange } from '../lib/ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  useSupabaseIdentity,
  useContacts,
  useSessions,
  freshDraft,
  getContactsRetentionExpiry,
  hasDraftInProgress,
  resumeDraft,
  namedSessionsByRecent,
  latestInProgressDraft,
} from '@griever/hooks';
import type { Session, SendFlowDraft, UseSupabaseIdentityResult } from '@griever/hooks';
import type { AuthClient, ProfileResult } from '@griever/api-client/auth';
import type { MomentKey, SessionDetails, TemplateCategory } from '@griever/shared';
import { contactStore } from '@griever/data-local';
import { setSyncUserId } from '../lib/registerSync';
import { AUTH_ENABLED } from '../lib/features';
import { hasStoredSession, loadAuthClient } from '../lib/authClient';
import type { AuthClientResult } from '../lib/authClient';
import { WhatYoullNeedProvider } from '../lib/whatYoullNeedContext';
import { SignUp } from '../screens/SignUp';
import { CreateAccount } from '../screens/CreateAccount';
import { ForgotPassword } from '../screens/ForgotPassword';
import { ChooseNewPassword } from '../screens/ChooseNewPassword';
import { captureRecoveryLink, takeRecoveryLink } from '../lib/recoveryLink';
import { Profile } from '../screens/Profile';
import { Settings } from '../screens/Settings';
import { removeEverythingFromDevice } from '../lib/removeFromDevice';
import { AddContactsManual } from '../screens/AddContactsManual';
import type { ContactDraft } from '../screens/AddContactsManual';
import { ImportContacts } from '../screens/ImportContacts';
import { WhoHearsFirst } from '../screens/WhoHearsFirst';
import { SessionSetup } from '../screens/SessionSetup';
import { Home } from '../screens/Home';
import { PathLanding } from '../screens/PathLanding';
import { Gate } from '../screens/Gate';
import { WhatYoullNeed } from '../screens/WhatYoullNeed';
import { ShareObituary } from '../screens/ShareObituary';
import { ObituaryScreen } from '../screens/ObituaryScreen';
import { Flow } from './Flow';

type AppView =
  | 'signup'
  | 'createAccount'
  | 'forgotPassword'
  | 'chooseNewPassword'
  | 'profile'
  | 'settings'
  | 'addContactsManual'
  | 'importContacts'
  | 'whoHearsFirst'
  | 'checkContacts'
  | 'setup'
  | 'home'
  | 'pathLanding'
  | 'gate'
  | 'whatYoullNeed'
  | 'shareObituary'
  | 'flow'
  | 'obituary';

const CATEGORY_BY_MOMENT: Partial<Record<MomentKey, TemplateCategory>> = {
  announce: 'announcement',
  service: 'service',
  thanks: 'aftercare',
};

const browserStorage =
  typeof window !== 'undefined' ? window.localStorage : undefined;

// Defined at module scope: a component declared inside App would be a new
// type on every render, remounting the screen and wiping what was typed.
function Shell({
  children,
  onWhatYoullNeed,
  notice,
}: {
  children: React.ReactNode;
  onWhatYoullNeed: () => void;
  notice?: ReactNode;
}) {
  return (
    <div className="min-h-screen flex justify-center" style={{ background: 'var(--color-bg)' }}>
      <div className="w-full max-w-[420px] px-5 py-8">
        {notice}
        <WhatYoullNeedProvider onWhatYoullNeed={onWhatYoullNeed}>{children}</WhatYoullNeedProvider>
      </div>
    </div>
  );
}

function WithIdentity({
  client,
  children,
}: {
  client: AuthClient;
  children: (auth: UseSupabaseIdentityResult, client: AuthClient) => ReactNode;
}) {
  return <>{children(useSupabaseIdentity({ client, storage: browserStorage }), client)}</>;
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

/**
 * Loads the Supabase client (its own chunk) and only then mounts the identity hook, which needs
 * a client at render time. Rendered only when AUTH_ENABLED is on.
 */
function AuthGate({
  children,
  removed,
  onRemoved,
}: {
  children: (auth: UseSupabaseIdentityResult, client: AuthClient) => ReactNode;
  removed: boolean;
  onRemoved: () => void;
}) {
  const [loaded, setLoaded] = useState<AuthClientResult | null>(null);
  // Bumped by "Try again"; loadAuthClient forgets a failed load, so this runs it afresh.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    void loadAuthClient().then((result) => {
      if (live) setLoaded(result);
    });
    return () => {
      live = false;
    };
  }, [attempt]);

  if (!loaded) {
    return (
      <Shell onWhatYoullNeed={noop}>
        <Loading />
      </Shell>
    );
  }
  if (!loaded.available && hasStoredSession()) {
    // Accounts can't be reached, but this device holds a signed-in session: the work on it is
    // theirs and stays reachable (C5). No account actions, and nothing here touches the network.
    return <AppBody auth={null} offline removed={removed} onRemoved={onRemoved} />;
  }
  if (!loaded.available) {
    return (
      <Shell onWhatYoullNeed={noop}>
        <div className="flex flex-col gap-3 pt-[52px]">
          <h1 className="text-[22px]">Accounts aren't available right now</h1>
          <p className="text-[14px] leading-[1.6] m-0" style={{ color: 'var(--text-muted)' }}>
            Nothing you've written is lost. You can try again in a moment.
          </p>
          <button
            type="button"
            className="gg-btn gg-btn-secondary gg-btn-block"
            onClick={() => {
              setLoaded(null);
              setAttempt((n) => n + 1);
            }}
          >
            Try again
          </button>
        </div>
      </Shell>
    );
  }
  return <WithIdentity client={loaded.client}>{children}</WithIdentity>;
}

function noop() {
  // The checklist is not reachable before the app has loaded.
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
  // Before anything can load or fail: take a reset token out of the address bar.
  if (AUTH_ENABLED) captureRecoveryLink();
  const body = !AUTH_ENABLED ? (
    <AppBody key={removals} auth={null} removed={removed} onRemoved={onRemoved} />
  ) : (
    <AuthGate key={removals} removed={removed} onRemoved={onRemoved}>
      {(auth, client) => <AppBody auth={auth} client={client} removed={removed} onRemoved={onRemoved} />}
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
async function accountLacksName(client: AuthClient): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), NAME_CHECK_TIMEOUT_MS);
  });
  try {
    return await Promise.race([client.getProfile().then(lacksName), timedOut]);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Screens the checklist returns to; from anywhere else (the flow, a gate) it returns to the path. */
const CHECKLIST_RETURNS: AppView[] = [
  'home',
  'settings',
  'profile',
  'signup',
  'createAccount',
  'forgotPassword',
  'pathLanding',
  'checkContacts',
  // The walk after "Create a new one": the checklist returns to the step it was opened from.
  'setup',
  'addContactsManual',
  'importContacts',
  'whoHearsFirst',
];

/** Views that need a person to be open; with nobody open Home is shown instead. */
const NEEDS_PERSON: AppView[] = ['pathLanding', 'flow', 'setup', 'gate', 'shareObituary', 'obituary'];

function isAccountView(view: AppView): boolean {
  return view === 'signup' || view === 'createAccount' || view === 'forgotPassword';
}

function AppBody({
  auth,
  client,
  offline = false,
  removed = false,
  onRemoved,
}: {
  auth: UseSupabaseIdentityResult | null;
  /** Everything was just removed from this device: say so on the first screen. */
  removed?: boolean;
  onRemoved: () => void;
  client?: AuthClient;
  /** Signed in on this device, but accounts can't be reached: local work only. */
  offline?: boolean;
}) {
  const contacts = useContacts(contactStore);
  const sessions = useSessions(browserStorage);
  const sessionList = sessions.sessions;
  const storedPhones = useMemo(() => new Set(contacts.contacts.map((c) => c.phone)), [contacts.contacts]);
  // Without auth there is no account gate — everyone is let straight in.
  const isSignedIn = auth ? auth.isSignedIn : true;

  const [view, setView] = useState<AppView>(() => {
    if (offline) return 'home';
    // Opened from a reset email: the new-password screen, not sign-up.
    if (AUTH_ENABLED && captureRecoveryLink()) return 'chooseNewPassword';
    if (AUTH_ENABLED) return 'signup';
    // Home is always the first screen, with or without people (A2b); contacts come later in the walk.
    return 'home';
  });
  const firstView = useRef(view);
  // A save can finish after the person has moved on; it reads the screen from here and never navigates.
  const viewRef = useRef(view);
  viewRef.current = view;
  // Shown once, on the first screen after a removal; leaving it ends it for good.
  const [showRemoved, setShowRemoved] = useState(removed);
  useEffect(() => {
    if (view !== firstView.current) setShowRemoved(false);
  }, [view]);
  const [activeId, setActiveId] = useState<string | null>(null);
  // Which moment's draft the flow opens with. Undefined (a returning visit) means the one
  // changed most recently; null means a moment not chosen yet, so the picker.
  const [flowCategory, setFlowCategory] = useState<TemplateCategory | null | undefined>(undefined);
  const [setupEditing, setSetupEditing] = useState(false);
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
  // Which contacts view the walk used, so Back from who hears first returns to it.
  const [contactsView, setContactsView] = useState<'addContactsManual' | 'importContacts'>('addContactsManual');
  // The name typed at sign-up, saved once the new account has a session.
  const [pendingName, setPendingName] = useState<string | null>(null);
  // The account has no name: Profile opens with a "What should we call you?" prompt.
  const [needsName, setNeedsName] = useState(false);
  // Profile is open straight after sign-up: Continue (or Save) goes on to Home.
  const [firstProfile, setFirstProfile] = useState(false);
  // The name typed at sign-up, shown on that first Profile even before the saved one is known.
  const [signUpName, setSignUpName] = useState('');
  // The background save of that name failed while Profile was still open: say so there, calmly.
  const [nameSaveFailed, setNameSaveFailed] = useState(false);
  // The name a save is in flight for, so Continue does not send the same one twice.
  const savingName = useRef<string | null>(null);
  const [askingName, setAskingName] = useState(false);
  // Bumped on every sign-in attempt and every sign-out. A name check started under an earlier
  // number is for a different sign-in, so its answer is dropped (it must not prompt someone else).
  const accountGeneration = useRef(0);
  // Where the prompt interrupted, so Save or Back returns there and onboarding carries on.
  const [returnTo, setReturnTo] = useState<AppView>('home');
  // Set by the Sign out button, so only that (not a session that ended elsewhere) leaves the screen.
  const [leftOnPurpose, setLeftOnPurpose] = useState(false);
  // The checklist goes back to where it was opened from: Home, or otherwise the path as before.
  const checklistBack = useRef<AppView>('pathLanding');
  const openWhatYoullNeed = useCallback(() => {
    if (view === 'whatYoullNeed') return;
    checklistBack.current = CHECKLIST_RETURNS.includes(view) ? view : 'pathLanding';
    setView('whatYoullNeed');
  }, [view]);

  const signedIn = auth?.isSignedIn ?? false;
  const signedOut = auth !== null && !auth.isLoading && !auth.isSignedIn;
  useFocusHeadingOnChange(view);
  const updateSenderName = auth?.updateSenderName;
  const clearError = auth?.clearError;

  const openProfile = useCallback(
    (asksName: boolean, from: AppView = 'home') => {
      // A stale error from another screen would otherwise show here without being announced.
      clearError?.();
      setAskingName(asksName);
      setFirstProfile(false);
      setNameSaveFailed(false);
      setReturnTo(from);
      setNeedsName(false);
      setView('profile');
    },
    [clearError],
  );

  // Sign-in resolves asynchronously (the boot-time session check, or a form), so the next view
  // can't be decided in useState's initializer. A new account sees Profile first; everyone else
  // lands on Home.
  useEffect(() => {
    if (!signedIn || !isAccountView(view)) return;
    if (pendingName !== null && updateSenderName) {
      const generation = accountGeneration.current;
      const name = pendingName;
      savingName.current = name;
      void updateSenderName(name).then((saved) => {
        savingName.current = null;
        if (saved || generation !== accountGeneration.current) return;
        // Only the first Profile is told: the person has moved on otherwise, and a late answer
        // must not pull them back. The sign-in check asks for the name next time. If the save
        // failed because the session ended, the effect further down drops the request instead.
        if (viewRef.current !== 'profile') return;
        clearError?.();
        setNameSaveFailed(true);
        setNeedsName(true);
      });
      setPendingName(null);
      setSignUpName(name);
      setAskingName(false);
      setNameSaveFailed(false);
      setFirstProfile(true);
      setView('profile');
    } else {
      setFirstProfile(false);
      setNameSaveFailed(false);
      setFlowCategory(undefined);
      setView('home');
      // Boot-time session or form sign-in: ask in the background whether the account has a name.
      // It never holds anyone back, and it clears a prompt left over from an earlier session.
      if (client) {
        const generation = accountGeneration.current;
        void accountLacksName(client).then((lacks) => {
          if (generation === accountGeneration.current) setNeedsName(lacks);
        });
      }
    }
  }, [signedIn, view, pendingName, updateSenderName, clearError, client]);

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

  // Only the Sign out button sends the person back to sign-up. A session that ended some other
  // way keeps them where they are (C5), with a note.
  useEffect(() => {
    if (signedOut && leftOnPurpose && !isAccountView(view)) {
      setLeftOnPurpose(false);
      setFlowCategory(undefined);
      setView('signup');
    }
  }, [signedOut, leftOnPurpose, view]);
  const sessionEnded = signedOut && !leftOnPurpose && !isAccountView(view) && view !== 'chooseNewPassword';
  // One polite region that is always there, so the note is announced when its text appears.
  const signedOutNote = auth ? (
    <div role="status" aria-live="polite" className="text-[13px]">
      {sessionEnded && (
        <div className="flex flex-col gap-1 mb-4">
          <p className="m-0">You've been signed out. Your work on this device is safe. Sign in again when you're ready.</p>
          <button
            type="button"
            onClick={() => setView('createAccount')}
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
    </>
  );

  async function removeEverything() {
    // Local only: signOut here is supabase-js's local scope. It deletes nothing on a server.
    await removeEverythingFromDevice(window.localStorage, client ? () => client.signOut() : undefined);
    onRemoved();
  }

  // Sync stays unbound for now. Which id Convex should be keyed by for a Supabase user is open
  // (#39), so the Supabase user id is deliberately not passed in.
  useEffect(() => {
    void setSyncUserId(null);
  }, []);

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
      setFlowCategory(d.templateCategory);
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

  // Once a send job finishes, record who was told for dedup + the path view.
  const flowDraft = flowCategory ? active?.drafts[flowCategory] : undefined;
  const activeStep = flowDraft?.step;
  const activeCategory = flowDraft?.templateCategory;
  useEffect(() => {
    if (activeId && activeStep === 'sent' && activeCategory && flowDraft) {
      recordMomentComplete(activeId, activeCategory, flowDraft.selectedContactIds);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, activeStep, activeCategory]);

  const activeDetails = useMemo<SessionDetails | null>(
    () =>
      active
        ? {
            personName: active.personName,
            dateOfPassing: active.dateOfPassing,
            senderName: active.senderName,
            obituaryUrl: active.obituaryUrl,
            obituaryPublisher: active.obituaryPublisher,
            serviceDate: active.serviceDate,
          }
        : null,
    [active],
  );

  // With no one open, the path has nobody to show: go to Home instead.
  function goToPathLanding() {
    setView(active ? 'pathLanding' : 'home');
  }

  function goHome() {
    setView('home');
  }

  /** Leaves the first Profile for Home. A name still missing is asked for at the next sign-in. */
  function leaveFirstProfile() {
    setFirstProfile(false);
    setNameSaveFailed(false);
    setNeedsName(false);
    setView('home');
  }

  /** Continue on the first Profile: a changed or unsaved name is saved in the background, never awaited (C5). */
  function continueFromFirstProfile(name: string) {
    const known = auth?.profile?.senderName ?? '';
    if (name && updateSenderName && savingName.current !== name && (nameSaveFailed || name !== known)) {
      void updateSenderName(name);
    }
    leaveFirstProfile();
  }

  /** Makes this person the active one. A message left half-written reopens where it was (#25). */
  function openPerson(id: string) {
    const person = sessions.sessions.find((s) => s.id === id);
    if (!person) return;
    setCreating(false);
    sessions.touchSession(id);
    setActiveId(id);
    setFlowCategory(undefined);
    setView(latestInProgressDraft(person) ? 'flow' : 'pathLanding');
  }

  function backFromChecklist() {
    const target = checklistBack.current;
    setView(target === 'pathLanding' && !active ? 'home' : target);
  }

  function startSetup() {
    const created = sessions.createSession();
    setActiveId(created.id);
    setSetupEditing(false);
    setView('setup');
  }

  /** "Create a new one" on Home: setup first, then the rest of the walk. */
  function startNewSession() {
    setCreating(true);
    setContactDraft({ name: '', phone: '', hearsFirst: false });
    setFirstTicks(null);
    setContactsView('addContactsManual');
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
    else setView(contactsView);
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
      setView('flow');
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
    // thanks — no dedicated entry screen yet; let the picker handle it.
    const category = CATEGORY_BY_MOMENT[key];
    if (category && hasDraftInProgress(active.drafts[category])) {
      openMoment(category, freshDraft({ templateCategory: category, step: 'template' }));
      return;
    }
    setFlowCategory(null);
    setView('flow');
  }

  // While a stored session is being checked, render nothing rather than flash "signup" first.
  if (auth?.isLoading) {
    return (
      <Shell onWhatYoullNeed={openWhatYoullNeed}>
        <Loading />
      </Shell>
    );
  }

  // ---- Flow D: account + contacts onboarding ----

  if (auth && view === 'signup') {
    return (
      <Shell onWhatYoullNeed={openWhatYoullNeed} notice={endedNote}>
        <SignUp
          error={auth.error}
          onSignIn={() => {
            auth.clearError();
            setView('createAccount');
          }}
          onSubmit={async ({ name, email, password }) => {
            setPendingName(name);
            const ok = await auth.signUp(email, password);
            if (!ok) setPendingName(null);
            return ok;
          }}
        />
      </Shell>
    );
  }

  if (auth && view === 'createAccount') {
    return (
      <Shell onWhatYoullNeed={openWhatYoullNeed} notice={endedNote}>
        <CreateAccount
          error={auth.error}
          onForgotPassword={() => {
            auth.clearError();
            setView('forgotPassword');
          }}
          onBack={() => {
            auth.clearError();
            setView('signup');
          }}
          onSubmit={async ({ email, password }) => {
            // A name left over from a sign-up that is still waiting on email confirmation
            // must not overwrite the name on an existing account.
            setPendingName(null);
            accountGeneration.current += 1;
            // The name check runs once signed in (the effect above), never holding sign-in back.
            return auth.signIn(email, password);
          }}
        />
      </Shell>
    );
  }

  if (auth && view === 'forgotPassword') {
    return (
      <Shell onWhatYoullNeed={openWhatYoullNeed} notice={endedNote}>
        <ForgotPassword
          onBack={() => setView('createAccount')}
          onSubmit={(email) => auth.requestReset(email, window.location.origin)}
        />
      </Shell>
    );
  }

  if (auth && view === 'chooseNewPassword') {
    return (
      <Shell onWhatYoullNeed={openWhatYoullNeed}>
        <ChooseNewPassword
          openLink={() => auth.openRecoveryLink(takeRecoveryLink())}
          onSubmit={auth.completeReset}
          onAskForNewLink={() => setView('forgotPassword')}
          onBackToSignIn={() => setView('createAccount')}
          onContinue={() => {
            // Same as a sign-in: ask for a name if the account has none.
            setPendingName(null);
            accountGeneration.current += 1;
            const generation = accountGeneration.current;
            if (client) {
              void accountLacksName(client).then((lacks) => {
                if (generation === accountGeneration.current) setNeedsName(lacks);
              });
            }
            setFlowCategory(undefined);
            setView('home');
          }}
        />
      </Shell>
    );
  }

  if (auth && view === 'profile') {
    return (
      <Shell onWhatYoullNeed={openWhatYoullNeed} notice={endedNote}>
        <Profile
          asksName={askingName}
          firstTime={firstProfile}
          saveFailed={firstProfile && nameSaveFailed}
          onContinue={continueFromFirstProfile}
          senderName={auth.profile?.senderName ?? (firstProfile ? signUpName : null)}
          error={auth.error}
          onBack={() => {
            auth.clearError();
            if (firstProfile) {
              leaveFirstProfile();
              return;
            }
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
            setFirstProfile(false);
            accountGeneration.current += 1;
            setLeftOnPurpose(true);
            setCreating(false);
            void auth.signOut();
          }}
        />
      </Shell>
    );
  }

  if (view === 'settings') {
    return (
      <Shell onWhatYoullNeed={openWhatYoullNeed} notice={endedNote}>
        <Settings
          onBack={goHome}
          onRemoveEverything={removeEverything}
          signsOut={offline || (auth?.isSignedIn ?? false)}
        />
      </Shell>
    );
  }

  if (view === 'addContactsManual') {
    return (
      <Shell onWhatYoullNeed={openWhatYoullNeed} notice={endedNote}>
        <AddContactsManual
          contacts={contacts.contacts}
          onBack={backToSetup}
          onAdd={({ name, phone, hearsFirst }) =>
            contacts.addContact({ name, phone, tier: hearsFirst ? 'first' : 'family' })
          }
          onDone={() => {
            setContactsView('addContactsManual');
            setView('whoHearsFirst');
          }}
          draft={contactDraft}
          onDraftChange={setContactDraft}
        />
      </Shell>
    );
  }

  if (view === 'importContacts') {
    return (
      <Shell onWhatYoullNeed={openWhatYoullNeed} notice={endedNote}>
        <ImportContacts
          storedPhones={storedPhones}
          onBack={() => setView('addContactsManual')}
          onSwitchToManual={() => setView('addContactsManual')}
          onContinue={(picked, source) => {
            contacts.importContacts(picked, source);
            setContactsView('importContacts');
            setView('whoHearsFirst');
          }}
        />
      </Shell>
    );
  }

  if (view === 'checkContacts') {
    return (
      <Shell onWhatYoullNeed={openWhatYoullNeed} notice={endedNote}>
        <Loading />
      </Shell>
    );
  }

  if (view === 'whoHearsFirst') {
    return (
      <Shell onWhatYoullNeed={openWhatYoullNeed} notice={endedNote}>
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
      <Shell onWhatYoullNeed={openWhatYoullNeed} notice={endedNote}>
        <ObituaryScreen
          session={activeDetails}
          onBack={() => setView('shareObituary')}
          onDone={() => setView('shareObituary')}
        />
      </Shell>
    );
  }

  if (view === 'whatYoullNeed') {
    return (
      <Shell onWhatYoullNeed={openWhatYoullNeed} notice={endedNote}>
        <WhatYoullNeed
          onBack={backFromChecklist}
          onEmailList={backFromChecklist}
        />
      </Shell>
    );
  }

  if (view === 'gate' && active) {
    return (
      <Shell onWhatYoullNeed={openWhatYoullNeed} notice={endedNote}>
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
      <Shell onWhatYoullNeed={openWhatYoullNeed} notice={endedNote}>
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
      <Shell onWhatYoullNeed={openWhatYoullNeed} notice={endedNote}>
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
    // A send under way or finished is never reopened from Home; with no moment chosen the picker
    // shows. If the flow is mounted again mid-send or at Sent (a prompt came between), the moment
    // keeps its place instead of starting over on the picker (#167): mid-send comes back on Review
    // (the send job is not saved), Sent stays Sent. A sent draft holds no wording (C2).
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
      <Shell onWhatYoullNeed={openWhatYoullNeed} notice={endedNote}>
        <Flow
          key={active.id}
          session={activeDetails}
          draft={flowStart}
          drafts={active.drafts}
          contacts={contacts.contacts}
          notifiedContactIds={active.recipientsNotified.announcement ?? []}
          onDraftChange={onDraftChange}
          onExitToLanding={goToPathLanding}
          onHome={goHome}
          onEditSession={() => {
            setSetupEditing(true);
            setView('setup');
          }}
          onAddContact={({ name, phone }) => contacts.addContact({ name, phone, tier: 'family' })}
        />
      </Shell>
    );
  }

  if (view === 'pathLanding' && active) {
    return (
      <Shell onWhatYoullNeed={openWhatYoullNeed} notice={endedNote}>
        <PathLanding
          session={active}
          onBack={goHome}
          onStartMoment={startMoment}
          onWhatYoullNeed={openWhatYoullNeed}
        />
      </Shell>
    );
  }

  // Home is also the fallback: a view with nobody open (the path, a flow) never shows a blank screen.
  return (
    <Shell onWhatYoullNeed={openWhatYoullNeed} notice={endedNote}>
      <Home sessions={sessionList} onOpen={openPerson} onCreate={startNewSession} canCreate />
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
