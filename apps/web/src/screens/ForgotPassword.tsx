import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import { TopBar } from '../lib/ui';

interface Props {
  onBack: () => void;
  /** Always resolves with calm copy; `ok` tells whether the request went through. */
  onSubmit: (email: string) => Promise<{ ok: boolean; message: string }>;
}

export function ForgotPassword({ onBack, onSubmit }: Props) {
  const ids = useId();
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<{ ok: boolean; message: string } | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setOutcome(null);
    try {
      setOutcome(await onSubmit(email.trim()));
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <TopBar onBack={onBack} />
      <div className="flex flex-col gap-1">
        <h1 className="text-[22px]">Reset your password</h1>
        <p className="text-[13px] m-0" style={{ color: 'var(--text-muted)' }}>
          Enter your email and we'll send you a link to choose a new one.
        </p>
      </div>

      <div className="gg-field">
        <label htmlFor={`${ids}-email`}>Email</label>
        <input
          id={`${ids}-email`}
          className="gg-input"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <div
        aria-live="polite"
        className="text-[13px]"
        style={outcome && !outcome.ok ? { color: 'var(--color-danger, #b91c1c)' } : undefined}
      >
        {outcome?.message}
      </div>

      <button type="submit" aria-disabled={pending} className="gg-btn gg-btn-primary gg-btn-block">
        {pending ? 'Sending…' : 'Send me a link'}
      </button>
    </form>
  );
}
