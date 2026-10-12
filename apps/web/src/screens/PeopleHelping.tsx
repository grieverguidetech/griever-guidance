import { useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { parseInviteEmail } from '@griever/shared';
import type { MembersView } from '@griever/shared';
import { formatDate } from '../lib/format';

const EMAIL_INVALID = "That email doesn't look right.";
const INVITE_SENT = 'Invitation sent.';

interface Props {
  view: MembersView | null;
  status: 'idle' | 'loading' | 'ready' | 'offline' | 'unavailable' | 'signed_out';
  /** The members hook's own calm copy for the last failure, shown as-is. */
  message: string | null;
  /** Resolves true when the server accepted the invitation. */
  onInvite: (email: string) => Promise<boolean>;
  /** Resolves true when the invitation was cancelled. */
  onRevoke: (id: string) => Promise<boolean>;
}

/** Shown inside Profile. Emails are typed, never picked from contacts (C3, C6). */
export function PeopleHelping({ view, status, message, onInvite, onRevoke }: Props) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    const parsed = parseInviteEmail(email);
    if (!parsed) {
      setInvalid(true);
      setResult('');
      inputRef.current?.focus();
      return;
    }
    setInvalid(false);
    setPending(true);
    setResult('');
    try {
      const ok = await onInvite(parsed);
      if (ok) {
        setEmail('');
        setResult(INVITE_SENT);
      }
    } finally {
      setPending(false);
    }
  }

  async function revoke(inviteId: string) {
    setResult('');
    const ok = await onRevoke(inviteId);
    if (ok) setResult('Invitation cancelled.');
  }

  const live = (
    <div role="status" aria-live="polite" className="text-[13px]">
      {result || message || ''}
    </div>
  );

  if (view?.role === 'member') {
    return (
      <section aria-labelledby={`${id}-heading`} className="flex flex-col gap-3">
        <h2 id={`${id}-heading`} className="sr-only">
          People helping
        </h2>
        <p className="text-[14px] leading-[1.6] m-0">
          You're helping {view.owner.name ?? 'someone'}.
        </p>
        {live}
      </section>
    );
  }

  const members = view?.role === 'owner' ? view.members : [];
  const invites = view?.role === 'owner' ? view.invites : [];

  return (
    <section aria-labelledby={`${id}-heading`} className="flex flex-col gap-3">
      <h2 id={`${id}-heading`} className="text-[16px] m-0">
        People helping you
      </h2>
      <p className="text-[14px] leading-[1.6] m-0" style={{ color: 'var(--text-muted)' }}>
        They can see the people you're writing about and send their own messages from their own phone.
      </p>

      <form className="flex flex-col gap-3" onSubmit={submit} noValidate>
        <div className="gg-field">
          <label htmlFor={`${id}-email`}>Their email</label>
          <input
            ref={inputRef}
            id={`${id}-email`}
            className="gg-input"
            type="email"
            autoComplete="off"
            value={email}
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? `${id}-error` : undefined}
            onChange={(e) => {
              setEmail(e.target.value);
              setInvalid(false);
              setResult('');
            }}
          />
          {invalid && (
            <p id={`${id}-error`} className="m-0 text-[13px]" style={{ color: 'var(--color-danger, #b91c1c)' }}>
              {EMAIL_INVALID}
            </p>
          )}
        </div>
        <button type="submit" aria-disabled={pending} className="gg-btn gg-btn-secondary gg-btn-block">
          {pending ? 'Sending…' : 'Send an invitation'}
        </button>
      </form>

      {live}

      {status === 'loading' && !view && <p className="text-[13px] m-0">Loading…</p>}

      {members.length > 0 && (
        <ul className="flex flex-col gap-2 m-0 p-0 list-none">
          {members.map((m) => (
            <li key={m.id} className="text-[14px]">
              {m.name ?? m.email}
            </li>
          ))}
        </ul>
      )}

      {invites.length > 0 && (
        <ul className="flex flex-col gap-3 m-0 p-0 list-none">
          {invites.map((invite) => (
            <li key={invite.id} className="flex flex-col gap-1">
              <span className="text-[14px]">{invite.email}</span>
              <span className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
                Invited · link works until {formatDate(invite.expiresAt)}
              </span>
              <button
                type="button"
                className="gg-btn gg-btn-ghost self-start !px-0 min-h-[44px]"
                onClick={() => void revoke(invite.id)}
              >
                Cancel this invitation
                <span className="sr-only"> for {invite.email}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
