import { useId, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { TopBar } from '../lib/ui';

const SAVE_FAILED = "We couldn't save your name. You can try again.";
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
  /** Straight after sign-up: one primary Continue, which hands over the name and goes on to Home. */
  firstTime?: boolean;
  onContinue?: (name: string) => void;
  /** The background save of the sign-up name failed; Continue tries again. */
  saveFailed?: boolean;
  /** The identity hook's own calm copy, shown as-is. */
  error: string | null;
  /** Optional extra section under the form ("People helping you"). Nothing renders when absent. */
  peopleHelping?: ReactNode;
}

export function Profile({ asksName, firstTime, onContinue, saveFailed, senderName, onBack, onSave, onSignOut, error, peopleHelping }: Props) {
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
    if (firstTime) {
      onContinue?.(value.trim());
      return;
    }
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

  const form = (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <TopBar onBack={onBack} />
      <h1 className="text-[22px]">{asksName ? 'What should we call you?' : 'Your account'}</h1>
      {(asksName || firstTime) && (
        <p id={`${id}-intro`} className="text-[13px] m-0" style={{ color: 'var(--text-muted)' }}>
          {asksName ? 'This is the name on your account.' : 'This is the name on your account. You can change it later.'}
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
          required={!firstTime}
          aria-describedby={asksName || firstTime ? `${id}-intro` : undefined}
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
        style={nameError || error || saveFailed ? { color: 'var(--color-danger, #b91c1c)' } : undefined}
      >
        {nameError ?? (saveFailed ? SAVE_FAILED : (error ?? (saved ? 'Your name is saved.' : '')))}
      </div>

      {firstTime ? (
        <button type="submit" className="gg-btn gg-btn-primary gg-btn-block">
          Continue
        </button>
      ) : (
        <>
          <button type="submit" aria-disabled={pending} className="gg-btn gg-btn-primary gg-btn-block">
            {pending ? 'Saving…' : 'Save'}
          </button>
          <button type="button" onClick={onSignOut} className="gg-btn gg-btn-ghost gg-btn-block">
            Sign out
          </button>
        </>
      )}
    </form>
  );
  if (!peopleHelping) return form;
  // The invite form is its own form, so it sits beside this one, never inside it.
  return (
    <div className="flex flex-col gap-6">
      {form}
      {peopleHelping}
    </div>
  );
}
