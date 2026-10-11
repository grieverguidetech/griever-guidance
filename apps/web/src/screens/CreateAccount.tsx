import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import { TopBar } from '../lib/ui';

export interface SignInInput {
  email: string;
  password: string;
}

interface Props {
  onBack: () => void;
  /** Resolves true when signed in. A false result keeps everything typed. */
  onSubmit: (input: SignInInput) => Promise<boolean>;
  /** The identity hook's own calm copy, shown as-is. */
  error: string | null;
}

/** The sign-in screen. The file keeps its old name; sign-up lives in SignUp. */
export function CreateAccount({ onBack, onSubmit, error }: Props) {
  const ids = useId();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    try {
      await onSubmit({ email: email.trim(), password });
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit} aria-busy={pending}>
      <TopBar onBack={onBack} />
      <div className="flex flex-col gap-1">
        <h1 className="text-[22px]">Sign in</h1>
        <p className="text-[13px] m-0" style={{ color: 'var(--text-muted)' }}>
          Pick up where you left off.
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

      <div className="gg-field">
        <label htmlFor={`${ids}-password`}>Password</label>
        <input
          id={`${ids}-password`}
          className="gg-input"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      <div aria-live="polite" className="text-[13px]" style={{ color: 'var(--color-danger, #b91c1c)' }}>
        {error}
      </div>

      <button type="submit" disabled={pending} className="gg-btn gg-btn-primary gg-btn-block">
        {pending ? 'Signing you in…' : 'Sign in'}
      </button>
    </form>
  );
}
