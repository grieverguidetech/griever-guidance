import { useCallback, useEffect, useMemo, useState } from 'react';
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
} from '@griever/hooks';
import type { Session, SendFlowDraft, UseSupabaseIdentityResult } from '@griever/hooks';
import type { AuthClient, ProfileResult } from '@griever/api-client/auth';
import type { MomentKey, SessionDetails, TemplateCategory } from '@griever/shared';
import { contactStore } from '@griever/data-local';
import { setSyncUserId } from '../lib/registerSync';
import { AUTH_ENABLED } from '../lib/features';
import { loadAuthClient } from '../lib/authClient';
import type { AuthClientResult } from '../lib/authClient';
import { WhatYoullNeedProvider } from '../lib/whatYoullNeedContext';
import { SignUp } from '../screens/SignUp';
import { CreateAccount } from '../screens/CreateAccount';
import { Profile } from '../screens/Profile';
import { AddContactsManual } from '../screens/AddContactsManual';
import { ImportContacts } from '../screens/ImportContacts';
import { WhoHearsFirst } from '../screens/WhoHearsFirst';
import { SessionSetup } from '../screens/SessionSetup';
import { PathLanding } from '../screens/PathLanding';
import { Gate } from '../screens/Gate';
import { WhatYoullNeed } from '../screens/WhatYoullNeed';
import { ShareObituary } from '../screens/ShareObituary';
import { ObituaryScreen } from '../screens/ObituaryScreen';
import { Flow } from './Flow';

type AppView =
  | 'signup'
  | 'createAccount'
  | 'profile'
  | 'addContactsManual'
  | 'importContacts'
  | 'whoHearsFirst'
  | 'setup'
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
function AuthGate({ children }: { children: (auth: UseSupabaseIdentityResult, client: AuthClient) => ReactNode }) {
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

export function App() {
  // With the flag off nothing auth-related loads or renders, and the app is as it was.
  if (!AUTH_ENABLED) return <AppBody auth={null} />;
  return <AuthGate>{(auth, client) => <AppBody auth={auth} client={client} />}</AuthGate>;
}

/** True when the signed-in account has no name yet (or the name is blank). */
function lacksName(result: ProfileResult): boolean {
  if (result.ok) return !result.profile.senderName?.trim();
  return result.reason === 'no_profile';
}

const NAME_CHECK_TIMEOUT_MS = 5000;

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

/** A message left half-written reopens where it was (#25); otherwise the path. */
function viewForReturning(sessionList: Session[]): AppView {
  const latest = namedSessionsByRecent(sessionList)[0];
  return latest && hasDraftInProgress(latest.draft) ? 'flow' : 'pathLanding';
}

function isAccountView(view: AppView): boolean {
  return view === 'signup' || view === 'createAccount';
}

function AppBody({ auth, client }: { auth: UseSupabaseIdentityResult | null; client?: AuthClient }) {
  const contacts = useContacts(contactStore);
  const sessions = useSessions(browserStorage);
  const sessionList = sessions.sessions;
  const storedPhones = useMemo(() => new Set(contacts.contacts.map((c) => c.phone)), [contacts.contacts]);
  // Without auth there is no account gate — everyone is let straight in.
  const isSignedIn = auth ? auth.isSignedIn : true;

  const [view, setView] = useState<AppView>(() => {
    if (AUTH_ENABLED) return 'signup';
    // useSessions reads storage synchronously, so a returning visitor goes
    // straight to their session; a first visit starts at adding contacts.
    return namedSessionsByRecent(sessions.sessions).length === 0
      ? 'addContactsManual'
      : viewForReturning(sessions.sessions);
  });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [setupEditing, setSetupEditing] = useState(false);
  // The name typed at sign-up, saved once the new account has a session.
  const [pendingName, setPendingName] = useState<string | null>(null);
  // The account has no name: Profile opens with a "What should we call you?" prompt.
  const [needsName, setNeedsName] = useState(false);
  const [askingName, setAskingName] = useState(false);
  // Where the prompt interrupted, so Save or Back returns there and onboarding carries on.
  const [returnTo, setReturnTo] = useState<AppView>('pathLanding');
  // Set by the Sign out button, so only that (not a session that ended elsewhere) leaves the screen.
  const [leftOnPurpose, setLeftOnPurpose] = useState(false);
  const openWhatYoullNeed = useCallback(() => setView('whatYoullNeed'), []);

  const signedIn = auth?.isSignedIn ?? false;
  const signedOut = auth !== null && !auth.isLoading && !auth.isSignedIn;
  const updateSenderName = auth?.updateSenderName;
  const clearError = auth?.clearError;

  const openProfile = useCallback(
    (asksName: boolean, from: AppView = 'pathLanding') => {
      // A stale error from another screen would otherwise show here without being announced.
      clearError?.();
      setAskingName(asksName);
      setReturnTo(from);
      setNeedsName(false);
      setView('profile');
    },
    [clearError],
  );

  // Sign-in resolves asynchronously (the boot-time session check, or a form), so the next view
  // can't be decided in useState's initializer. A new account goes on to add contacts.
  useEffect(() => {
    if (!signedIn || !isAccountView(view)) return;
    if (pendingName !== null && updateSenderName) {
      void updateSenderName(pendingName).then((saved) => {
        if (saved) return;
        // The prompt below asks again, so the failure message need not linger. If the save failed
        // because the session ended, the effect further down drops the request instead.
        clearError?.();
        setNeedsName(true);
      });
      setPendingName(null);
      setView('addContactsManual');
    } else {
      setView(viewForReturning(sessionList));
    }
  }, [signedIn, view, pendingName, updateSenderName, clearError, sessionList]);

  // An account with no name (a failed save at sign-up, or a sign-in to one): ask for it, then
  // return to wherever this interrupted.
  useEffect(() => {
    if (signedIn && needsName && !isAccountView(view) && view !== 'profile') openProfile(true, view);
  }, [signedIn, needsName, view, openProfile]);

  // No session, no prompt: it would be stale by the next sign-in.
  useEffect(() => {
    if (signedOut && needsName) setNeedsName(false);
  }, [signedOut, needsName]);

  // Only the Sign out button sends the person back to sign-up. A session that ended some other
  // way keeps them where they are (C5), with a note.
  useEffect(() => {
    if (signedOut && leftOnPurpose && !isAccountView(view)) {
      setLeftOnPurpose(false);
      setView('signup');
    }
  }, [signedOut, leftOnPurpose, view]);
  const sessionEnded = signedOut && !leftOnPurpose && !isAccountView(view);
  // One polite region that is always there, so the note is announced when its text appears.
  const endedNote = auth ? (
    <div role="status" aria-live="polite" className="text-[13px]">
      {sessionEnded && (
        <div className="flex flex-col gap-1 mb-4">
          <p className="m-0">You've been signed out. Your work on this device is safe. Sign in again when you're ready.</p>
          <button
            type="button"
            onClick={() => setView('createAccount')}
            className="gg-btn gg-btn-ghost self-start !px-0"
            style={{ color: 'var(--color-accent-700)' }}
          >
            Sign in
          </button>
        </div>
      )}
    </div>
  ) : null;

  // Sync stays unbound for now. Which id Convex should be keyed by for a Supabase user is open
  // (#39), so the Supabase user id is deliberately not passed in.
  useEffect(() => {
    void setSyncUserId(null);
  }, []);

  const sortedSessions = useMemo(() => namedSessionsByRecent([...sessions.sessions]), [sessions.sessions]);

  useEffect(() => {
    // While the name prompt is about to open, don't also start a session (the two would race).
    if (!isSignedIn || activeId || needsName) return;
    if (sortedSessions.length > 0) {
      setActiveId(sortedSessions[0].id);
      return;
    }
    // No sessions at all — only auto-create once onboarding has handed off
    // (whoHearsFirst does this explicitly too; this covers a returning
    // account whose only session was deleted).
    if (view === 'pathLanding' || view === 'flow' || view === 'setup') {
      const created = sessions.createSession();
      setActiveId(created.id);
      setSetupEditing(false);
      setView('setup');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn, activeId, sortedSessions, view, needsName]);

  const active = useMemo<Session | null>(
    () => sessions.sessions.find((s) => s.id === activeId) ?? null,
    [sessions.sessions, activeId],
  );

  const { updateDraft, updateSession, recordMomentComplete } = sessions;
  const onDraftChange = useCallback(
    (d: SendFlowDraft) => {
      if (!activeId) return;
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
  const activeStep = active?.draft?.step;
  const activeCategory = active?.draft?.templateCategory;
  useEffect(() => {
    if (activeId && activeStep === 'sent' && activeCategory && active) {
      recordMomentComplete(activeId, activeCategory, active.draft?.selectedContactIds ?? []);
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

  function goToPathLanding() {
    setView('pathLanding');
  }

  function startNewSession() {
    const created = sessions.createSession();
    setActiveId(created.id);
    setSetupEditing(false);
    setView('setup');
  }

  function finishSetup() {
    goToPathLanding();
  }

  function backFromSetup() {
    if (setupEditing) {
      setView('flow');
      return;
    }
    sessions.pruneEmpty();
    goToPathLanding();
  }

  function startMoment(key: MomentKey) {
    if (!active) return;
    // Starting a moment that is already under way resumes it; a fresh draft would wipe what was typed.
    if (hasDraftInProgress(active.draft) && active.draft.templateCategory === CATEGORY_BY_MOMENT[key]) {
      if (active.draft.step === 'template') sessions.updateDraft(active.id, resumeDraft(active.draft));
      setView('flow');
      return;
    }
    if (key === 'announce') {
      sessions.updateDraft(active.id, freshDraft({ templateCategory: 'announcement', step: 'announce' }));
      setView('flow');
      return;
    }
    if (key === 'service') {
      if (active.serviceReady) {
        sessions.updateDraft(active.id, freshDraft({ templateCategory: 'service', step: 'details' }));
        setView('flow');
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
    sessions.updateDraft(active.id, freshDraft({ templateCategory: null, step: 'template' }));
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
          onBack={() => {
            auth.clearError();
            setView('signup');
          }}
          onSubmit={async ({ email, password }) => {
            // A name left over from a sign-up that is still waiting on email confirmation
            // must not overwrite the name on an existing account.
            setPendingName(null);
            const ok = await auth.signIn(email, password);
            // Signing in never waits on a second request: the name check runs in the background
            // and, if the account has no name, opens the prompt afterwards. It also clears a
            // prompt left over from an earlier session.
            if (ok && client) void accountLacksName(client).then(setNeedsName);
            return ok;
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
          senderName={auth.profile?.senderName ?? null}
          error={auth.error}
          onBack={() => {
            auth.clearError();
            setAskingName(false);
            setView(askingName ? returnTo : 'pathLanding');
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
            setLeftOnPurpose(true);
            void auth.signOut();
          }}
        />
      </Shell>
    );
  }

  if (view === 'addContactsManual') {
    return (
      <Shell onWhatYoullNeed={openWhatYoullNeed} notice={endedNote}>
        <AddContactsManual
          contacts={contacts.contacts}
          onBack={auth ? goToPathLanding : undefined}
          onAdd={({ name, phone, hearsFirst }) =>
            contacts.addContact({ name, phone, tier: hearsFirst ? 'first' : 'family' })
          }
          onDone={() => setView('whoHearsFirst')}
        />
      </Shell>
    );
  }

  if (view === 'importContacts') {
    return (
      <Shell onWhatYoullNeed={openWhatYoullNeed} notice={endedNote}>
        <ImportContacts
          storedPhones={storedPhones}
          onBack={() => (auth ? goToPathLanding() : setView('addContactsManual'))}
          onSwitchToManual={() => setView('addContactsManual')}
          onContinue={(picked, source) => {
            contacts.importContacts(picked, source);
            setView('whoHearsFirst');
          }}
        />
      </Shell>
    );
  }

  if (view === 'whoHearsFirst') {
    return (
      <Shell onWhatYoullNeed={openWhatYoullNeed} notice={endedNote}>
        <WhoHearsFirst
          contacts={contacts.contacts}
          onBack={() =>
            setView(
              !auth || auth.profile?.contactSource === 'manual' ? 'addContactsManual' : 'importContacts',
            )
          }
          onSave={(firstIds) => {
            const firstSet = new Set(firstIds);
            for (const c of contacts.contacts) {
              contacts.setTier(c.contactId, firstSet.has(c.contactId) ? 'first' : 'family');
            }
            startNewSession();
          }}
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
        <WhatYoullNeed onBack={() => goToPathLanding()} onEmailList={() => goToPathLanding()} />
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
              sessions.updateDraft(active.id, freshDraft({ templateCategory: 'service', step: 'details' }));
              setView('flow');
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
            sessions.updateDraft(
              active.id,
              freshDraft({ templateCategory: 'obituary', templateOverrideId: 'obituary-link', step: 'contacts' }),
            );
            setView('flow');
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
    return (
      <Shell onWhatYoullNeed={openWhatYoullNeed} notice={endedNote}>
        <Flow
          key={active.id}
          session={activeDetails}
          draft={active.draft}
          contacts={contacts.contacts}
          notifiedContactIds={active.recipientsNotified.announcement ?? []}
          onDraftChange={onDraftChange}
          onExitToLanding={goToPathLanding}
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
          otherSessions={sortedSessions.filter((s) => s.id !== active.id)}
          onStartMoment={startMoment}
          onWhatYoullNeed={() => setView('whatYoullNeed')}
          onNewSession={startNewSession}
        />
        {auth && !sessionEnded && (
          <button
            type="button"
            onClick={() => openProfile(false)}
            className="gg-btn gg-btn-ghost gg-btn-block mt-4"
            style={{ color: 'var(--color-accent-700)' }}
          >
            Your account
          </button>
        )}
      </Shell>
    );
  }

  // No active session yet (fresh account, or the active one was pruned) —
  // the effect above creates one and moves to 'setup'.
  return <Shell onWhatYoullNeed={openWhatYoullNeed} notice={endedNote}>{null}</Shell>;
}

export default App;
