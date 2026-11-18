import { useEffect, useRef, useState } from 'react';
import { screenCopy } from '@griever/copy';

const copy = screenCopy('join');

/**
 * - `invited`: signed out, with a saved invitation link.
 * - `joining`: signed in, the invitation is being accepted.
 * - `unusable`: a dead link (wrong, expired, used, revoked: one message for all). The link is dropped.
 * - `conflict`: this account already has people of its own. The link is dropped.
 * - `offline`: no connection, or no answer in time. The link stays saved for a later load.
 * - `later`: the server could not do it now (busy, too many tries, signed out). The link stays saved.
 */
export type JoinPhase = 'invited' | 'joining' | 'unusable' | 'conflict' | 'offline' | 'later';

type MessagePhase = Exclude<JoinPhase, 'invited' | 'joining'>;

const MESSAGES: Record<MessagePhase, { heading: string; body: string }> = {
  unusable: { heading: copy.unusableHeading, body: copy.unusableBody },
  conflict: { heading: copy.conflictHeading, body: copy.conflictBody },
  offline: { heading: copy.offlineHeading, body: copy.offlineBody },
  later: { heading: copy.laterHeading, body: copy.laterBody },
};

/** Says "Joining…" from a polite region that is already in the page, a moment after it appears, so it is announced. */
function JoiningStatus() {
  const [text, setText] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setText(copy.joining), 50);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div role="status" aria-live="polite" className="text-[14px] pt-[52px]" style={{ color: 'var(--text-muted)' }}>
      {text}
    </div>
  );
}

/**
 * The invitation link's screen (#128). Joining is a status (no h1); every other phase has its own h1,
 * and focus moves to it so a screen reader says the new state. Nothing here shows or holds the token.
 */
export function Join({
  phase,
  onCreateAccount,
  onSignIn,
  onContinue,
}: {
  phase: JoinPhase;
  onCreateAccount: () => void;
  onSignIn: () => void;
  onContinue: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [phase]);

  if (phase === 'joining') {
    return <JoiningStatus />;
  }

  const { heading: title, body } = phase === 'invited' ? { heading: copy.heading, body: copy.body } : MESSAGES[phase];
  return (
    <div className="flex flex-col gap-3 pt-[52px]">
      <h1 ref={heading} tabIndex={-1} className="text-[22px]">
        {title}
      </h1>
      <p className="text-[14px] leading-[1.6] m-0" style={{ color: 'var(--text-muted)' }}>
        {body}
      </p>
      {phase === 'invited' ? (
        <>
          <button type="button" className="gg-btn gg-btn-primary gg-btn-block" onClick={onCreateAccount}>
            {copy.createAccount}
          </button>
          <button type="button" className="gg-btn gg-btn-secondary gg-btn-block" onClick={onSignIn}>
            {copy.signIn}
          </button>
        </>
      ) : (
        <button type="button" className="gg-btn gg-btn-secondary gg-btn-block" onClick={onContinue}>
          {copy.continue}
        </button>
      )}
    </div>
  );
}
