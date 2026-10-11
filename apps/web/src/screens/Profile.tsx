import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import { TopBar } from '../lib/ui';

interface Props {
  /** The saved name, if one is known yet. It can arrive after the screen opens. */
  senderName: string | null;
  onBack: () => void;
  /** Resolves true when saved. A false result keeps what was typed. */
  onSave: (name: string) => Promise<boolean>;
  onSignOut: () => void;
  /** The identity hook's own calm copy, shown as-is. */
  error: string | null;
}

export function Profile({ senderName, onBack, onSave, onSignOut, error }: Props) {
  const id = useId();
  // Until the person types, show whatever name is known, including one that loads late.
  const [typed, setTyped] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const value = typed ?? senderName ?? '';

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
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
    <form className="flex flex-col gap-4" onSubmit={submit} aria-busy={pending}>
      <TopBar onBack={onBack} />
      <h1 className="text-[22px]">Your account</h1>

      <div className="gg-field">
        <label htmlFor={`${id}-name`}>Your name</label>
        <input
          id={`${id}-name`}
          className="gg-input"
          type="text"
          autoComplete="name"
          required
          value={value}
          onChange={(e) => {
            setTyped(e.target.value);
            setSaved(false);
          }}
        />
      </div>

      <div aria-live="polite" className="text-[13px]" style={error ? { color: 'var(--color-danger, #b91c1c)' } : undefined}>
        {error ?? (saved ? 'Your name is saved.' : '')}
      </div>

      <button type="submit" disabled={pending} className="gg-btn gg-btn-primary gg-btn-block">
        {pending ? 'Saving…' : 'Save'}
      </button>
      <button type="button" onClick={onSignOut} className="gg-btn gg-btn-ghost gg-btn-block">
        Sign out
      </button>
    </form>
  );
}
