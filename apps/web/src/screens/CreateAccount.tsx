import { useState } from 'react';
import { BackButton } from '../lib/ui';

interface Props {
  onBack: () => void;
  onCreate: (input: { name: string; email: string; password: string }) => void;
  /** Surfaced from the real sign-up call — e.g. "An account with that email already exists." */
  error?: string | null;
  isSubmitting?: boolean;
}

export function CreateAccount({ onBack, onCreate, error, isSubmitting }: Props) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const canContinue = name.trim() && email.trim() && password.length >= 8 && !isSubmitting;

  return (
    <div className="flex flex-col gap-4">
      <BackButton onClick={onBack} />
      <div className="flex flex-col gap-1">
        <h1 className="text-[22px]">Create an account</h1>
        <p className="text-[13px] m-0" style={{ color: 'var(--text-muted)' }}>
          So nothing you write gets lost.
        </p>
      </div>

      <div className="gg-field">
        <label htmlFor="ca-name">Your name</label>
        <input
          id="ca-name"
          className="gg-input"
          type="text"
          placeholder="e.g. Anna"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="gg-field">
        <label htmlFor="ca-email">Email</label>
        <input
          id="ca-email"
          className="gg-input"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <div className="gg-field">
        <label htmlFor="ca-password">Password</label>
        <input
          id="ca-password"
          className="gg-input"
          type="password"
          placeholder="At least 8 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      {error && (
        <p className="text-[12px] m-0" style={{ color: 'var(--color-danger, #b91c1c)' }}>
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={() => onCreate({ name: name.trim(), email: email.trim(), password })}
        disabled={!canContinue}
        className="gg-btn gg-btn-primary gg-btn-block"
      >
        {isSubmitting ? 'Creating account…' : 'Continue'}
      </button>
      <p className="text-[12px] text-center m-0" style={{ color: 'var(--text-muted)' }}>
        You can start writing straight away — confirm your email whenever you like.
      </p>
    </div>
  );
}
