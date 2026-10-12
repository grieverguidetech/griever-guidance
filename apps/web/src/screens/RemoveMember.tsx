import { useEffect, useRef, useState } from 'react';

interface Member {
  id: string;
  name: string | null;
  email: string;
}

interface Props {
  members: Member[];
  /** The members hook's own calm copy for the last failure, shown as-is when a removal fails. */
  message: string | null;
  /** Resolves true when the member was removed. */
  onRemove: (id: string) => Promise<boolean>;
}

type Result = { kind: 'removed'; name: string } | { kind: 'failed' } | null;
type FocusTarget = { row: string } | 'heading' | null;

/** Shown inside Settings, the only place removal is offered (C9): a button and a confirm step, never a swipe. */
export function RemoveMember({ members, message, onRemove }: Props) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<Result>(null);
  const confirmRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const rowButtons = useRef(new Map<string, HTMLButtonElement>());
  const focusAfterClose = useRef<FocusTarget>(null);
  // Once shown, the section stays so the last removal can still be announced and hold focus.
  const hadMembers = useRef(false);
  if (members.length > 0) hadMembers.current = true;

  // Focus follows the swap: into the confirm step when it opens, back out when it closes.
  useEffect(() => {
    if (confirmingId) {
      confirmRef.current?.focus();
      return;
    }
    const target = focusAfterClose.current;
    focusAfterClose.current = null;
    if (target === 'heading') headingRef.current?.focus();
    else if (target) rowButtons.current.get(target.row)?.focus();
  }, [confirmingId]);

  if (members.length === 0 && !hadMembers.current) return null;

  function close(target: FocusTarget) {
    focusAfterClose.current = target;
    setConfirmingId(null);
  }

  async function remove(member: Member) {
    if (pending) return;
    setPending(true);
    // Emptied first, then set after a tick, so a repeat of the same message is read out again.
    setResult(null);
    let ok = false;
    try {
      ok = await onRemove(member.id);
    } finally {
      setPending(false);
    }
    const next: Result = ok ? { kind: 'removed', name: member.name ?? member.email } : { kind: 'failed' };
    setTimeout(() => setResult(next), 50);
    close(ok ? 'heading' : { row: member.id });
  }

  const status = result?.kind === 'removed' ? `${result.name} has been removed.` : result?.kind === 'failed' ? (message ?? '') : '';

  return (
    <section aria-labelledby="remove-member-heading" className="flex flex-col gap-3">
      <h2 id="remove-member-heading" ref={headingRef} tabIndex={-1} className="text-[16px] m-0" style={{ outline: 'none' }}>
        People helping you
      </h2>
      <div role="status" aria-live="polite" className="text-[13px]">
        {status}
      </div>
      <ul className="flex flex-col gap-3 m-0 p-0 list-none">
        {members.map((m) => {
          const name = m.name ?? m.email;
          return (
            <li key={m.id} className="flex flex-col gap-3">
              {confirmingId === m.id ? (
                <div
                  ref={confirmRef}
                  tabIndex={-1}
                  role="group"
                  aria-labelledby={`remove-member-${m.id}`}
                  className="flex flex-col gap-3"
                  style={{ outline: 'none' }}
                >
                  <p id={`remove-member-${m.id}`} className="text-[14px] leading-[1.6] m-0">
                    {name} won't see the people you're writing about any more.
                  </p>
                  <button
                    type="button"
                    className="gg-btn gg-btn-primary gg-btn-block"
                    aria-disabled={pending}
                    onClick={() => void remove(m)}
                  >
                    Remove
                  </button>
                  <button
                    type="button"
                    className="gg-btn gg-btn-secondary gg-btn-block"
                    disabled={pending}
                    onClick={() => close({ row: m.id })}
                  >
                    Keep
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  ref={(el) => {
                    if (el) rowButtons.current.set(m.id, el);
                    else rowButtons.current.delete(m.id);
                  }}
                  className="gg-btn gg-btn-secondary gg-btn-block"
                  onClick={() => {
                    setResult(null);
                    setConfirmingId(m.id);
                  }}
                >
                  Remove {name}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
