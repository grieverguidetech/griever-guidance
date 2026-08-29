import { useCallback, useMemo, useState } from 'react';
import { useSessions } from '@griever/hooks';
import type { SendFlowDraft } from '@griever/hooks';
import type { SessionDetails } from '@griever/shared';
import { Landing } from '../screens/Landing';
import { SessionSetup } from '../screens/SessionSetup';
import { HistoryScreen } from '../screens/HistoryScreen';
import { ObituaryScreen } from '../screens/ObituaryScreen';
import { Flow } from './Flow';

type AppView = 'landing' | 'setup' | 'flow' | 'history' | 'obituary';

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
  const sessions = useSessions(browserStorage);
  const [view, setView] = useState<AppView>('landing');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [setupEditing, setSetupEditing] = useState(false);

  const active = useMemo(
    () => sessions.sessions.find((s) => s.id === activeId) ?? null,
    [sessions.sessions, activeId],
  );

  const { updateDraft } = sessions;
  const onDraftChange = useCallback(
    (d: SendFlowDraft) => {
      if (activeId) updateDraft(activeId, d);
    },
    [activeId, updateDraft],
  );

  const activeDetails = useMemo<SessionDetails | null>(
    () =>
      active
        ? {
            personName: active.personName,
            dateOfPassing: active.dateOfPassing,
            senderName: active.senderName,
            obituaryUrl: active.obituaryUrl,
          }
        : null,
    [active],
  );

  function startNewSession() {
    const created = sessions.createSession();
    setActiveId(created.id);
    setSetupEditing(false);
    setView('setup');
  }

  function continueSession(id: string) {
    sessions.touchSession(id);
    setActiveId(id);
    setView('flow');
  }

  function finishSetup() {
    setView('flow');
  }

  function backFromSetup() {
    if (setupEditing) {
      setView('flow');
      return;
    }
    sessions.pruneEmpty();
    setActiveId(null);
    setView('landing');
  }

  if (view === 'history') {
    return (
      <Shell>
        <HistoryScreen onBack={() => setView(active ? 'flow' : 'landing')} />
      </Shell>
    );
  }

  if (view === 'obituary') {
    return (
      <Shell>
        <ObituaryScreen
          onBack={() => setView('landing')}
          onShareLink={({ fullName, dateOfPassing, url }) => {
            const target =
              active ??
              sessions.createSession({ personName: fullName, dateOfPassing });
            sessions.updateSession(target.id, { obituaryUrl: url });
            setActiveId(target.id);
            const ready = Boolean(
              (target.personName || fullName) &&
                (target.dateOfPassing || dateOfPassing),
            );
            setSetupEditing(ready);
            setView(ready ? 'flow' : 'setup');
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
          onDraftChange={onDraftChange}
          onExitToLanding={() => setView('landing')}
          onEditSession={() => {
            setSetupEditing(true);
            setView('setup');
          }}
          onViewHistory={() => setView('history')}
        />
      </Shell>
    );
  }

  return (
    <Shell>
      <Landing
        inProgressSessions={sessions.inProgressSessions}
        onNewSession={startNewSession}
        onContinueSession={continueSession}
        onViewHistory={() => setView('history')}
        onWriteObituary={() => setView('obituary')}
      />
    </Shell>
  );
}

export default App;
