import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAccount, useContacts, useSessions, freshDraft } from '@griever/hooks';
import type { Session, SendFlowDraft } from '@griever/hooks';
import type { AuthProvider, MomentKey, SessionDetails } from '@griever/shared';
import { contactStore } from '@griever/data-local';
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
import { HistoryScreen } from '../screens/HistoryScreen';
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
  | 'history'
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
  const account = useAccount(browserStorage);
  const contacts = useContacts(contactStore);
  const sessions = useSessions(browserStorage);
  const storedPhones = useMemo(() => new Set(contacts.contacts.map((c) => c.phone)), [contacts.contacts]);

  const [view, setView] = useState<AppView>(() => (account.hasAccount ? 'pathLanding' : 'signup'));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [setupEditing, setSetupEditing] = useState(false);

  const sortedSessions = useMemo(
    () =>
      [...sessions.sessions]
        .filter((s) => s.personName.trim() !== '')
        .sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt)),
    [sessions.sessions],
  );

  useEffect(() => {
    if (!account.hasAccount || activeId) return;
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
  }, [account.hasAccount, activeId, sortedSessions, view]);

  const active = useMemo<Session | null>(
    () => sessions.sessions.find((s) => s.id === activeId) ?? null,
    [sessions.sessions, activeId],
  );

  const { updateDraft, recordMomentComplete } = sessions;
  const onDraftChange = useCallback(
    (d: SendFlowDraft) => {
      if (activeId) updateDraft(activeId, d);
    },
    [activeId, updateDraft],
  );

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

  // ---- Flow D: account + contacts onboarding ----

  if (view === 'signup') {
    return (
      <Shell>
        <SignUp
          onContinueWithProvider={(provider: Extract<AuthProvider, 'google' | 'facebook' | 'x'>) => {
            account.createAccount(provider);
            setView('importContacts');
          }}
          onUseEmail={() => setView('createAccount')}
        />
      </Shell>
    );
  }

  if (view === 'createAccount') {
    return (
      <Shell>
        <CreateAccount
          onBack={() => setView('signup')}
          onCreate={({ name, email }) => {
            account.createAccount('password', { senderName: name, email });
            setView('addContactsManual');
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
            setView(account.account?.contactSource === 'manual' ? 'addContactsManual' : 'importContacts')
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

  if (view === 'history') {
    return (
      <Shell>
        <HistoryScreen onBack={() => setView(active ? 'pathLanding' : 'signup')} />
      </Shell>
    );
  }

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
          onViewHistory={() => setView('history')}
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
          onViewHistory={() => setView('history')}
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
