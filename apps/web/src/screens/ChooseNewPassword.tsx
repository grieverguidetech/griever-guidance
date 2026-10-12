import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { PASSWORD_HINT } from './SignUp';

type Outcome = { ok: boolean; message: string; expired?: boolean };

interface Props {
  /** Reads the recovery link once, when the screen opens. */
  openLink: () => Promise<Outcome>;
  onSubmit: (newPassword: string) => Promise<Outcome>;
  /** The link was no good: go and ask for another. */
  onAskForNewLink: () => void;
  /** The new password is set and the account is signed in. */
  onContinue: () => void;
}

type LinkState = 'checking' | 'ready' | { problem: string };

export function ChooseNewPassword({ openLink, onSubmit, onAskForNewLink, onContinue }: Props) {
  const ids = useId();
  const [link, setLink] = useState<LinkState>('checking');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  // The link is single-use; Strict Mode must not read it twice.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void openLink().then((result) => setLink(result.ok ? 'ready' : { problem: result.message }));
  }, [openLink]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending || done || link !== 'ready') return;
    setPending(true);
    setMessage(null);
    try {
      const result = await onSubmit(password);
      setMessage(result.message);
      if (result.ok) setDone(true);
      else if (result.expired) setLink({ problem: result.message });
    } finally {
      setPending(false);
    }
  }

  if (typeof link === 'object') {
    return (
      <div className="flex flex-col gap-4 pt-[52px]">
        <h1 className="text-[22px]">Choose a new password</h1>
        <div role="status" aria-live="polite" className="text-[13px]">
          {link.problem}
        </div>
        <button type="button" onClick={onAskForNewLink} className="gg-btn gg-btn-primary gg-btn-block">
          Send me a new link
        </button>
      </div>
    );
  }

  return (
    <form className="flex flex-col gap-4 pt-[52px]" onSubmit={submit}>
      <div className="flex flex-col gap-1">
        <h1 className="text-[22px]">Choose a new password</h1>
        <p className="text-[13px] m-0" style={{ color: 'var(--text-muted)' }}>
          You'll be signed in once it's saved.
        </p>
      </div>

      {!done && (
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
        style={message && !done ? { color: 'var(--color-danger, #b91c1c)' } : undefined}
      >
        {link === 'checking' ? '' : message}
      </div>

      {done ? (
        <button type="button" onClick={onContinue} className="gg-btn gg-btn-primary gg-btn-block">
          Continue
        </button>
      ) : (
        <button
          type="submit"
          aria-disabled={pending || link === 'checking'}
          className="gg-btn gg-btn-primary gg-btn-block"
        >
          {pending ? 'Saving…' : 'Save new password'}
        </button>
      )}
    </form>
  );
}
