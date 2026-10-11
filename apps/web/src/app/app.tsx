import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  useSupabaseIdentity,
  useContacts,
  useSessions,
  freshDraft,
  getContactsRetentionExpiry,
} from '@griever/hooks';
import type { Session, SendFlowDraft, UseSupabaseIdentityResult } from '@griever/hooks';
import type { AuthClient } from '@griever/api-client/auth';
import type { MomentKey, SessionDetails } from '@griever/shared';
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

const browserStorage =
  typeof window !== 'undefined' ? window.localStorage : undefined;

// Defined at module scope: a component declared inside App would be a new
// type on every render, remounting the screen and wiping what was typed.
function Shell({ children, onWhatYoullNeed }: { children: React.ReactNode; onWhatYoullNeed: () => void }) {
  return (
    <div className="min-h-screen flex justify-center" style={{ background: 'var(--color-bg)' }}>
      <div className="w-full max-w-[420px] px-5 py-8">
        <WhatYoullNeedProvider onWhatYoullNeed={onWhatYoullNeed}>{children}</WhatYoullNeedProvider>
      </div>
    </div>
  );
}

function WithIdentity({ client, children }: { client: AuthClient; children: (auth: UseSupabaseIdentityResult) => ReactNode }) {
  return <>{children(useSupabaseIdentity({ client, storage: browserStorage }))}</>;
}

/**
 * Loads the Supabase client (its own chunk) and only then mounts the identity hook, which needs
 * a client at render time. Rendered only when AUTH_ENABLED is on.
 */
function AuthGate({ children }: { children: (auth: UseSupabaseIdentityResult) => ReactNode }) {
  const [loaded, setLoaded] = useState<AuthClientResult | null>(null);

  useEffect(() => {
    let live = true;
    void loadAuthClient().then((result) => {
      if (live) setLoaded(result);
    });
    return () => {
      live = false;
    };
  }, []);

  if (!loaded) return <Shell onWhatYoullNeed={noop}>{null}</Shell>;
  if (!loaded.available) {
    return (
      <Shell onWhatYoullNeed={noop}>
        <p role="status" className="text-[14px] leading-[1.6] pt-[52px] m-0">
          Accounts aren't available right now.
        </p>
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
  return <AuthGate>{(auth) => <AppBody auth={auth} />}</AuthGate>;
}

function AppBody({ auth }: { auth: UseSupabaseIdentityResult | null }) {
  const contacts = useContacts(contactStore);
  const sessions = useSessions(browserStorage);
  const storedPhones = useMemo(() => new Set(contacts.contacts.map((c) => c.phone)), [contacts.contacts]);
  // Without auth there is no account gate — everyone is let straight in.
  const isSignedIn = auth ? auth.isSignedIn : true;

  const [view, setView] = useState<AppView>(() => {
    if (AUTH_ENABLED) return 'signup';
    // useSessions reads storage synchronously, so a returning visitor goes
    // straight to their session; a first visit starts at adding contacts.
    return sessions.sessions.some((s) => s.personName.trim() !== '') ? 'pathLanding' : 'addContactsManual';
  });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [setupEditing, setSetupEditing] = useState(false);
  // The name typed at sign-up, saved once the new account has a session.
  const [pendingName, setPendingName] = useState<string | null>(null);
  const openWhatYoullNeed = useCallback(() => setView('whatYoullNeed'), []);

  const signedIn = auth?.isSignedIn ?? false;
  const signedOut = auth !== null && !auth.isLoading && !auth.isSignedIn;
  const updateSenderName = auth?.updateSenderName;

  // Sign-in resolves asynchronously (the boot-time session check, or a form), so the next view
  // can't be decided in useState's initializer. A new account goes on to add contacts.
  useEffect(() => {
    if (!signedIn || (view !== 'signup' && view !== 'createAccount')) return;
    if (pendingName !== null && updateSenderName) {
      void updateSenderName(pendingName);
      setPendingName(null);
      setView('addContactsManual');
    } else {
      setView('pathLanding');
    }
  }, [signedIn, view, pendingName, updateSenderName]);

  // Signing out, or a session that ended, returns to the account screens.
  useEffect(() => {
    if (signedOut && view !== 'signup' && view !== 'createAccount') setView('signup');
  }, [signedOut, view]);

  // Sync stays unbound for now. Which id Convex should be keyed by for a Supabase user is open
  // (#39), so the Supabase user id is deliberately not passed in.
  useEffect(() => {
    void setSyncUserId(null);
  }, []);

  const sortedSessions = useMemo(
    () =>
      [...sessions.sessions]
        .filter((s) => s.personName.trim() !== '')
        .sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt)),
    [sessions.sessions],
  );

  useEffect(() => {
    if (!isSignedIn || activeId) return;
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
  }, [isSignedIn, activeId, sortedSessions, view]);

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
    return <Shell onWhatYoullNeed={openWhatYoullNeed}>{null}</Shell>;
  }

  // ---- Flow D: account + contacts onboarding ----

  if (auth && view === 'signup') {
    return (
      <Shell onWhatYoullNeed={openWhatYoullNeed}>
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
      <Shell onWhatYoullNeed={openWhatYoullNeed}>
        <CreateAccount
          error={auth.error}
          onBack={() => {
            auth.clearError();
            setView('signup');
          }}
          onSubmit={({ email, password }) => {
            // A name left over from a sign-up that is still waiting on email confirmation
            // must not overwrite the name on an existing account.
            setPendingName(null);
            return auth.signIn(email, password);
          }}
        />
      </Shell>
    );
  }

  if (auth && view === 'profile') {
    return (
      <Shell onWhatYoullNeed={openWhatYoullNeed}>
        <Profile
          senderName={auth.profile?.senderName ?? null}
          error={auth.error}
          onBack={() => {
            auth.clearError();
            goToPathLanding();
          }}
          onSave={auth.updateSenderName}
          onSignOut={() => void auth.signOut()}
        />
      </Shell>
    );
  }

  if (view === 'addContactsManual') {
    return (
      <Shell onWhatYoullNeed={openWhatYoullNeed}>
        <AddContactsManual
          contacts={contacts.contacts}
          onBack={auth ? () => setView('signup') : undefined}
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
      <Shell onWhatYoullNeed={openWhatYoullNeed}>
        <ImportContacts
          storedPhones={storedPhones}
          onBack={() => setView(auth ? 'signup' : 'addContactsManual')}
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
      <Shell onWhatYoullNeed={openWhatYoullNeed}>
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
      <Shell onWhatYoullNeed={openWhatYoullNeed}>
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
      <Shell onWhatYoullNeed={openWhatYoullNeed}>
        <WhatYoullNeed onBack={() => goToPathLanding()} onEmailList={() => goToPathLanding()} />
      </Shell>
    );
  }

  if (view === 'gate' && active) {
    return (
      <Shell onWhatYoullNeed={openWhatYoullNeed}>
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
      <Shell onWhatYoullNeed={openWhatYoullNeed}>
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
      <Shell onWhatYoullNeed={openWhatYoullNeed}>
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
      <Shell onWhatYoullNeed={openWhatYoullNeed}>
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
      <Shell onWhatYoullNeed={openWhatYoullNeed}>
        <PathLanding
          session={active}
          otherSessions={sortedSessions.filter((s) => s.id !== active.id)}
          onStartMoment={startMoment}
          onWhatYoullNeed={() => setView('whatYoullNeed')}
          onNewSession={startNewSession}
        />
        {auth && (
          <button
            type="button"
            onClick={() => setView('profile')}
            className="gg-btn gg-btn-ghost gg-btn-block mt-4"
          >
            Your account
          </button>
        )}
      </Shell>
    );
  }

  // No active session yet (fresh account, or the active one was pruned) —
  // the effect above creates one and moves to 'setup'.
  return <Shell onWhatYoullNeed={openWhatYoullNeed}>{null}</Shell>;
}

export default App;
