import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import { TopBar } from '../lib/ui';

const NAME_REQUIRED = 'Please enter your name.';

interface Props {
  /** True when the account has no name yet: asks "What should we call you?" instead. */
  asksName?: boolean;
  /** The saved name, if one is known yet. It can arrive after the screen opens. */
  senderName: string | null;
  onBack: () => void;
  /** Resolves true when saved. A false result keeps what was typed. */
  onSave: (name: string) => Promise<boolean>;
  onSignOut: () => void;
  /** Straight after sign-up: a primary Continue goes on to Home, and a name is optional to confirm. */
  firstTime?: boolean;
  onContinue?: () => void;
  /** The identity hook's own calm copy, shown as-is. */
  error: string | null;
}

export function Profile({ asksName, firstTime, onContinue, senderName, onBack, onSave, onSignOut, error }: Props) {
  const id = useId();
  // Until the person types, show whatever name is known, including one that loads late.
  const [typed, setTyped] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const value = typed ?? senderName ?? '';

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    if (!value.trim()) {
      setNameError(NAME_REQUIRED);
      return;
    }
    setNameError(null);
    setPending(true);
    setSaved(false);
    try {
      const ok = await onSave(value.trim());
      if (ok) {
        setTyped(null);
        setSaved(true);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <TopBar onBack={onBack} />
      <h1 className="text-[22px]">{asksName ? 'What should we call you?' : 'Your account'}</h1>
      {asksName && (
        <p className="text-[13px] m-0" style={{ color: 'var(--text-muted)' }}>
          This is the name on your account.
        </p>
      )}

      {firstTime && !asksName && (
        <p className="text-[13px] m-0" style={{ color: 'var(--text-muted)' }}>
          This is the name on your account. You can change it later.
        </p>
      )}

      <div className="gg-field">
        <label htmlFor={`${id}-name`}>Your name</label>
        <input
          id={`${id}-name`}
          className="gg-input"
          type="text"
          autoComplete="name"
          autoCapitalize="words"
          required
          value={value}
          onChange={(e) => {
            setTyped(e.target.value);
            setSaved(false);
            setNameError(null);
          }}
        />
      </div>

      <div
        aria-live="polite"
        className="text-[13px]"
        style={nameError || error ? { color: 'var(--color-danger, #b91c1c)' } : undefined}
      >
        {nameError ?? error ?? (saved ? 'Your name is saved.' : '')}
      </div>

      {firstTime && (
        <button type="button" onClick={onContinue} className="gg-btn gg-btn-primary gg-btn-block">
          Continue
        </button>
      )}
      <button
        type="submit"
        aria-disabled={pending}
        className={`gg-btn gg-btn-block ${firstTime ? 'gg-btn-secondary' : 'gg-btn-primary'}`}
      >
        {pending ? 'Saving…' : 'Save'}
      </button>
      <button
        type="button"
        onClick={onSignOut}
        className="gg-btn gg-btn-ghost gg-btn-block"
      >
        Sign out
      </button>
    </form>
  );
}
