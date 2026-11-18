import { useEffect, useRef } from 'react';
import { screenCopy } from '@griever/copy';

const copy = screenCopy('join');

/**
 * - `invited`: signed out, with a saved invitation link.
 * - `joining`: signed in, the invitation is being accepted.
 * - `unusable`: the server refused it (wrong, expired, used, revoked: one message for all).
 * - `offline`: no connection; the link stays saved for a later load.
 */
export type JoinPhase = 'invited' | 'joining' | 'unusable' | 'offline';

/**
 * The invitation link's screen (#128). Each phase has its own h1, and focus moves to it so a screen
 * reader says the new state. Nothing here shows or holds the token.
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
    return (
      <div role="status" className="text-[14px] pt-[52px]" style={{ color: 'var(--text-muted)' }}>
        {copy.joining}
      </div>
    );
  }

  const title = phase === 'invited' ? copy.heading : phase === 'unusable' ? copy.unusableHeading : copy.offlineHeading;
  const body = phase === 'invited' ? copy.body : phase === 'unusable' ? copy.unusableBody : copy.offlineBody;
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
