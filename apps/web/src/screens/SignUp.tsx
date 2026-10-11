import { useId, useState } from 'react';
import type { FormEvent } from 'react';

export interface SignUpInput {
  name: string;
  email: string;
  password: string;
}

interface Props {
  /** Resolves true when the account was created. A false result keeps everything typed. */
  onSubmit: (input: SignUpInput) => Promise<boolean>;
  onSignIn: () => void;
  /** The identity hook's own calm copy, shown as-is. */
  error: string | null;
}

export function SignUp({ onSubmit, onSignIn, error }: Props) {
  const ids = useId();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  // Still on screen after a successful sign-up means there is no session yet: email confirmation.
  const [checkEmail, setCheckEmail] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    try {
      const ok = await onSubmit({ name: name.trim(), email: email.trim(), password });
      if (ok) setCheckEmail(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="flex flex-col gap-4 pt-[52px] min-h-full" onSubmit={submit} aria-busy={pending}>
      <div className="flex flex-col gap-1">
        <h1 className="text-[28px] leading-[1.1]">Grievers Guidance</h1>
        <p className="text-[14px] leading-[1.6] m-0" style={{ color: 'var(--text-muted)' }}>
          We'll help you tell people what they need to know. First, somewhere safe to keep it.
        </p>
      </div>

      <div className="gg-field">
        <label htmlFor={`${ids}-name`}>Your name</label>
        <input
          id={`${ids}-name`}
          className="gg-input"
          type="text"
          autoComplete="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
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
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      <div aria-live="polite" className="text-[13px]" style={{ color: 'var(--color-danger, #b91c1c)' }}>
        {error}
      </div>
      {checkEmail && !error && (
        <p role="status" className="text-[13px] m-0">
          Please check your email to finish setting up your account.
        </p>
      )}

      <button type="submit" disabled={pending} className="gg-btn gg-btn-primary gg-btn-block">
        {pending ? 'Creating your account…' : 'Create account'}
      </button>
      <button type="button" onClick={onSignIn} className="gg-btn gg-btn-ghost gg-btn-block">
        I already have an account
      </button>

      <p className="text-[12px] m-0" style={{ color: 'var(--text-hint)', marginTop: 'auto' }}>
        We only ever use your contacts to send the messages you write. We don't post anything,
        anywhere.
      </p>
    </form>
  );
}
