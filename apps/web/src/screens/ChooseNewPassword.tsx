import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { maskEmail } from '../lib/recoveryLink';
import { PASSWORD_HINT } from './SignUp';

type Outcome = {
  ok: boolean;
  message: string;
  expired?: boolean;
  differentAccount?: boolean;
  email?: string | null;
};

interface Props {
  /** Reads the recovery link once, when the screen opens. */
  openLink: () => Promise<Outcome>;
  onSubmit: (newPassword: string) => Promise<Outcome>;
  /** The link was no good: go and ask for another. */
  onAskForNewLink: () => void;
  onBackToSignIn: () => void;
  /** The new password is set and the account is signed in. */
  onContinue: () => void;
}

type LinkState =
  | { phase: 'checking' }
  | { phase: 'ready'; email: string | null }
  | { phase: 'problem'; message: string; differentAccount: boolean };

export function ChooseNewPassword({ openLink, onSubmit, onAskForNewLink, onBackToSignIn, onContinue }: Props) {
  const ids = useId();
  const [link, setLink] = useState<LinkState>({ phase: 'checking' });
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  // The link is single-use; Strict Mode must not read it twice.
  const started = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const continueButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void openLink().then((result) =>
      setLink(
        result.ok
          ? { phase: 'ready', email: result.email ?? null }
          : { phase: 'problem', message: result.message, differentAccount: Boolean(result.differentAccount) },
      ),
    );
  }, [openLink]);

  // Focus follows the change of state, so keyboard and screen-reader users land on the news.
  useEffect(() => {
    if (link.phase === 'problem') heading.current?.focus();
  }, [link]);
  useEffect(() => {
    if (done) continueButton.current?.focus();
  }, [done]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending || done || link.phase !== 'ready') return;
    setPending(true);
    setMessage(null);
    try {
      const result = await onSubmit(password);
      setMessage(result.message);
      if (result.ok) setDone(true);
      else if (result.expired) setLink({ phase: 'problem', message: result.message, differentAccount: false });
    } finally {
      setPending(false);
    }
  }

  // One status region stays mounted through every state, so each change is announced.
  const status = link.phase === 'checking' ? 'Checking your link…' : link.phase === 'problem' ? link.message : message;
  const isProblem = link.phase === 'ready' && Boolean(message) && !done;

  return (
    <form className="flex flex-col gap-4 pt-[52px]" onSubmit={submit}>
      <div className="flex flex-col gap-1">
        <h1 ref={heading} tabIndex={-1} className="text-[22px]">
          Choose a new password
        </h1>
        {link.phase === 'ready' && (
          <p className="text-[13px] m-0" style={{ color: 'var(--text-muted)' }}>
            {link.email ? `For ${maskEmail(link.email)}. ` : ''}You'll be signed in once it's saved.
          </p>
        )}
      </div>

      {link.phase === 'ready' && !done && (
        <div className="gg-field">
          <label htmlFor={`${ids}-password`}>New password</label>
          <input
            id={`${ids}-password`}
            className="gg-input"
            type="password"
            autoComplete="new-password"
            aria-describedby={`${ids}-password-hint`}
            minLength={8}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p id={`${ids}-password-hint`} className="text-[12px] m-0 mt-1" style={{ color: 'var(--text-muted)' }}>
            {PASSWORD_HINT}
          </p>
        </div>
      )}

      <div
        role="status"
        aria-live="polite"
        className="text-[13px]"
        style={isProblem ? { color: 'var(--color-danger, #b91c1c)' } : undefined}
      >
        {status}
      </div>

      {link.phase === 'ready' && !done && (
        <button type="submit" aria-disabled={pending} className="gg-btn gg-btn-primary gg-btn-block">
          {pending ? 'Saving…' : 'Save new password'}
        </button>
      )}
      {link.phase === 'ready' && done && (
        <button ref={continueButton} type="button" onClick={onContinue} className="gg-btn gg-btn-primary gg-btn-block">
          Continue
        </button>
      )}
      {link.phase === 'problem' && link.differentAccount && (
        <button type="button" onClick={onContinue} className="gg-btn gg-btn-primary gg-btn-block">
          Continue
        </button>
      )}
      {link.phase === 'problem' && !link.differentAccount && (
        <>
          <button type="button" onClick={onAskForNewLink} className="gg-btn gg-btn-primary gg-btn-block">
            Send me a new link
          </button>
          <button type="button" onClick={onBackToSignIn} className="gg-btn gg-btn-ghost gg-btn-block">
            Back to sign in
          </button>
        </>
      )}
    </form>
  );
}
