import { useCallback, useEffect, useMemo, useState } from 'react';
import { useIdentity, useContacts, useSessions, freshDraft, getContactsRetentionExpiry } from '@griever/hooks';
import type { Session, SendFlowDraft } from '@griever/hooks';
import type { MomentKey, SessionDetails } from '@griever/shared';
import { contactStore } from '@griever/data-local';
import { setSyncUserId } from '../lib/registerSync';
import { SignUp } from '../screens/SignUp';
import { CreateAccount } from '../screens/CreateAccount';
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

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex justify-center" style={{ background: 'var(--color-bg)' }}>
      <div className="w-full max-w-[420px] px-5 py-8">{children}</div>
    </div>
  );
}

export function App() {
  const account = useIdentity(browserStorage);
  const contacts = useContacts(contactStore);
  const sessions = useSessions(browserStorage);
  const storedPhones = useMemo(() => new Set(contacts.contacts.map((c) => c.phone)), [contacts.contacts]);

  const [view, setView] = useState<AppView>('signup');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [setupEditing, setSetupEditing] = useState(false);
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);

  // Consumes a Facebook/Instagram sign-in's `#token=…` (or `#error=…`)
  // fragment, if this page load is one — runs once, before the view below
  // has a chance to render "signup" and flash it.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handled = account.completeOAuthCallback(window.location.hash);
    if (handled) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A real sign-in resolves asynchronously (the boot-time /auth/session
  // check, or the OAuth callback above) — unlike the client-only mock this
  // replaced, so this can't be decided synchronously in useState's initializer.
  useEffect(() => {
    if (account.isSignedIn && view === 'signup') setView('pathLanding');
  }, [account.isSignedIn, view]);

  // Keeps libs/data-sync attributed to whoever is actually signed in. See
  // registerSync.ts's setSyncUserId for exactly what this does (and does
  // not yet) make real in production.
  useEffect(() => {
    void setSyncUserId(account.identity?.userId ?? null);
  }, [account.identity?.userId]);

  const sortedSessions = useMemo(
    () =>
      [...sessions.sessions]
        .filter((s) => s.personName.trim() !== '')
        .sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt)),
    [sessions.sessions],
  );

  useEffect(() => {
    if (!account.isSignedIn || activeId) return;
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
  }, [account.isSignedIn, activeId, sortedSessions, view]);

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

  // While a previously-stored session token is being confirmed
  // (/auth/session), render nothing rather than flash "signup" first.
  if (account.isLoading) {
    return <Shell>{null}</Shell>;
  }

  // ---- Flow D: account + contacts onboarding ----

  if (view === 'signup') {
    return (
      <Shell>
        <SignUp
          onContinueWithProvider={(provider) => {
            const redirectTo = window.location.origin + window.location.pathname;
            window.location.href = account.oauthStartUrl(provider, redirectTo);
          }}
          onUseEmail={() => setView('createAccount')}
        />
        {account.error && (
          <p className="text-[12px] m-0" style={{ color: 'var(--color-danger, #b91c1c)' }}>
            {account.error}
          </p>
        )}
      </Shell>
    );
  }

  if (view === 'createAccount') {
    return (
      <Shell>
        <CreateAccount
          onBack={() => setView('signup')}
          error={account.error}
          isSubmitting={isCreatingAccount}
          onCreate={async ({ name, email, password }) => {
            setIsCreatingAccount(true);
            const ok = await account.signUpWithPassword({ email, password, senderName: name });
            setIsCreatingAccount(false);
            if (ok) setView('addContactsManual');
          }}
        />
      </Shell>
    );
  }

  if (view === 'addContactsManual') {
    return (
      <Shell>
        <AddContactsManual
          contacts={contacts.contacts}
          onBack={() => setView('createAccount')}
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
      <Shell>
        <ImportContacts
          storedPhones={storedPhones}
          onBack={() => setView('signup')}
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
      <Shell>
        <WhoHearsFirst
          contacts={contacts.contacts}
          onBack={() =>
            setView(account.identity?.contactSource === 'manual' ? 'addContactsManual' : 'importContacts')
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
      <Shell>
        <ObituaryScreen
          onBack={() => goToPathLanding()}
          onShareLink={({ fullName, dateOfPassing, url }) => {
            const target =
              active ?? sessions.createSession({ personName: fullName, dateOfPassing });
            sessions.updateSession(target.id, { obituaryUrl: url });
            setActiveId(target.id);
            goToPathLanding();
          }}
        />
      </Shell>
    );
  }

  if (view === 'whatYoullNeed') {
    return (
      <Shell>
        <WhatYoullNeed onBack={() => goToPathLanding()} onEmailList={() => goToPathLanding()} />
      </Shell>
    );
  }

  if (view === 'gate' && active) {
    return (
      <Shell>
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
      <Shell>
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
        />
      </Shell>
    );
  }

  if (view === 'setup' && active) {
    return (
      <Shell>
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
      <Shell>
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
      <Shell>
        <PathLanding
          session={active}
          otherSessions={sortedSessions.filter((s) => s.id !== active.id)}
          onStartMoment={startMoment}
          onWhatYoullNeed={() => setView('whatYoullNeed')}
          onNewSession={startNewSession}
        />
      </Shell>
    );
  }

  // No active session yet (fresh account, or the active one was pruned) —
  // the effect above creates one and moves to 'setup'.
  return <Shell>{null}</Shell>;
}

export default App;
