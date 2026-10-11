import { useId, useState } from 'react';
import type { FormEvent } from 'react';

export interface SignUpInput {
  name: string;
  email: string;
  password: string;
}

/** Shown under the password field. The Supabase minimum is a pending product decision. */
export const PASSWORD_HINT = 'Use at least 8 characters.';

const NAME_REQUIRED = 'Please enter your name.';

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
  const [nameError, setNameError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    if (!name.trim()) {
      setNameError(NAME_REQUIRED);
      return;
    }
    setNameError(null);
    setPending(true);
    try {
      const ok = await onSubmit({ name: name.trim(), email: email.trim(), password });
      if (ok) setCheckEmail(true);
    } finally {
      setPending(false);
    }
  }

  // One polite region carries every message, so each is announced.
  const message =
    nameError ??
    error ??
    (checkEmail
      ? 'Please check your email to finish setting up your account, then come back here and sign in.'
      : null);
  const isProblem = Boolean(nameError ?? error);

  return (
    <form className="flex flex-col gap-4 pt-[52px] min-h-full" onSubmit={submit}>
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
          autoCapitalize="words"
          required
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setNameError(null);
          }}
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

      <div
        aria-live="polite"
        className="text-[13px]"
        style={isProblem ? { color: 'var(--color-danger, #b91c1c)' } : undefined}
      >
        {message}
      </div>

      {/* The primary button's contrast is tracked in #8. */}
      <button type="submit" aria-disabled={pending} className="gg-btn gg-btn-primary gg-btn-block">
        {pending ? 'Creating your account…' : 'Create account'}
      </button>
      <button
        type="button"
        onClick={onSignIn}
        className="gg-btn gg-btn-ghost gg-btn-block"
        style={{ color: 'var(--color-accent-700)' }}
      >
        I already have an account
      </button>

      <p className="text-[12px] m-0" style={{ color: 'var(--text-hint)', marginTop: 'auto' }}>
        We only ever use your contacts to send the messages you write. We don't post anything,
        anywhere.
      </p>
    </form>
  );
}
