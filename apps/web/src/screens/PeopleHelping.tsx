import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { MembersStatus } from '@griever/hooks';
import { parseInviteEmail } from '@griever/shared';
import type { MembersView } from '@griever/shared';
import { formatDate } from '../lib/format';

const EMAIL_INVALID = "That email doesn't look right.";
const INVITE_SENT = 'Invitation sent.';
const INVITE_CANCELLED = 'Invitation cancelled.';

interface Props {
  view: MembersView | null;
  status: MembersStatus;
  /** The members hook's own calm copy for the last failure, shown as-is. */
  message: string | null;
  /** Resolves true when the server accepted the invitation. */
  onInvite: (email: string) => Promise<boolean>;
  /** Resolves true when the invitation was cancelled. */
  onRevoke: (id: string) => Promise<boolean>;
}

/** Shown inside Profile. Emails are typed, never picked from contacts (C3, C6). */
export function PeopleHelping({
  view,
  status,
  message,
  onInvite,
  onRevoke,
}: Props) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const invitedRef = useRef<HTMLHeadingElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Set after a successful cancel: the view the cancel started from, until a newer one arrives.
  const focusAfterRevoke = useRef<MembersView | null | 'none'>('none');
  const [revoked, setRevoked] = useState(0);
  const latestMessage = useRef(message);
  latestMessage.current = message;
  const [email, setEmail] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [pending, setPending] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [live, setLive] = useState('');

  // Emptied first, then set after a tick, so a repeat of the same message is read out again.
  function say(text: string) {
    clearTimeout(timer.current);
    setLive('');
    if (text) timer.current = setTimeout(() => setLive(text), 50);
  }

  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    if (message) setInvalid(false);
    say(message ?? '');
  }, [message]);

  // After a cancel, focus the list that is left, or the section heading if it is empty. Not the email
  // field: on a phone that opens the keyboard.
  useEffect(() => {
    if (focusAfterRevoke.current === 'none') return;
    const hasInvites = view?.role === 'owner' && view.invites.length > 0;
    (hasInvites ? invitedRef.current : headingRef.current)?.focus();
    if (view !== focusAfterRevoke.current) focusAfterRevoke.current = 'none';
  }, [view, revoked]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    const parsed = parseInviteEmail(email);
    if (!parsed) {
      setInvalid(true);
      inputRef.current?.focus();
      return;
    }
    setInvalid(false);
    setPending(true);
    say('');
    let ok = false;
    try {
      ok = await onInvite(parsed);
    } finally {
      setPending(false);
    }
    if (ok) setEmail('');
    say(ok ? INVITE_SENT : (latestMessage.current ?? ''));
  }

  async function revoke(inviteId: string) {
    if (revokingId) return;
    setRevokingId(inviteId);
    setInvalid(false);
    say('');
    let ok = false;
    try {
      ok = await onRevoke(inviteId);
    } finally {
      setRevokingId(null);
    }
    say(ok ? INVITE_CANCELLED : (latestMessage.current ?? ''));
    if (ok) {
      focusAfterRevoke.current = view;
      setRevoked((n) => n + 1);
    }
  }

  const owner = view?.role === 'owner' ? view : null;

  return (
    <div className="flex flex-col gap-3">
      {owner && (
        <section
          aria-labelledby={`${id}-heading`}
          className="flex flex-col gap-3"
        >
          <h2
            id={`${id}-heading`}
            ref={headingRef}
            tabIndex={-1}
            className="text-[16px] m-0"
          >
            People helping you
          </h2>
          <p
            className="text-[14px] leading-[1.6] m-0"
            style={{ color: 'var(--text-muted)' }}
          >
            They can see the people you're writing about and send their own
            messages from their own phone.
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
                  if (invalid) setInvalid(false);
                }}
              />
              {invalid && (
                <p
                  id={`${id}-error`}
                  className="m-0 text-[13px]"
                  style={{ color: 'var(--color-danger, #b91c1c)' }}
                >
                  {EMAIL_INVALID}
                </p>
              )}
            </div>
            <button
              type="submit"
              aria-disabled={pending}
              className="gg-btn gg-btn-secondary gg-btn-block"
            >
              {pending ? 'Sending…' : 'Send an invitation'}
            </button>
          </form>
        </section>
      )}
      {view?.role === 'member' && (
        <p className="text-[14px] leading-[1.6] m-0">
          You're helping {view.owner.name ?? 'someone'}.
        </p>
      )}

      {/* One region, always mounted at this spot, for announcements only. */}
      <div role="status" aria-live="polite" className="text-[13px]">
        {live}
      </div>

      {!view && status === 'loading' && (
        <p className="text-[13px] m-0">Loading…</p>
      )}

      {owner && owner.members.length > 0 && (
        <>
          <h3 className="text-[14px] m-0">Helping you</h3>
          <ul className="flex flex-col gap-2 m-0 p-0 list-none">
            {owner.members.map((m) => (
              <li key={m.id} className="text-[14px]">
                {m.name ?? m.email}
              </li>
            ))}
          </ul>
        </>
      )}

      {owner && owner.invites.length > 0 && (
        <>
          <h3
            ref={invitedRef}
            tabIndex={-1}
            className="text-[14px] m-0"
          >
            Invited
          </h3>
          <ul className="flex flex-col gap-3 m-0 p-0 list-none">
            {owner.invites.map((invite) => (
              <li key={invite.id} className="flex flex-col gap-1">
                <span className="text-[14px]">{invite.email}</span>
                <span
                  className="text-[13px]"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Invited · link works until {formatDate(invite.expiresAt)}
                </span>
                <button
                  type="button"
                  className="gg-btn gg-btn-ghost self-start !px-0"
                  aria-disabled={revokingId === invite.id}
                  onClick={() => void revoke(invite.id)}
                >
                  Cancel this invitation
                  <span className="sr-only"> for {invite.email}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
