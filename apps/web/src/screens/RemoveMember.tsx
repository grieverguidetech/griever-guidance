import { useEffect, useRef, useState } from 'react';

interface Member {
  id: string;
  name: string | null;
  email: string;
}

interface Props {
  members: Member[];
  /** Resolves true when the member was removed. */
  onRemove: (id: string) => Promise<boolean>;
}

/** Shown inside Settings, the only place removal is offered (C9): a button and a confirm step, never a swipe. */
export function RemoveMember({ members, onRemove }: Props) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const confirmRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (confirmingId) confirmRef.current?.focus();
  }, [confirmingId]);

  if (members.length === 0) return null;

  async function remove(id: string) {
    if (pending) return;
    setPending(true);
    try {
      await onRemove(id);
    } finally {
      setPending(false);
      setConfirmingId(null);
    }
  }

  return (
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
                  className="gg-btn gg-btn-primary gg-btn-block min-h-[44px]"
                  aria-disabled={pending}
                  onClick={() => void remove(m.id)}
                >
                  Remove
                </button>
                <button
                  type="button"
                  className="gg-btn gg-btn-secondary gg-btn-block min-h-[44px]"
                  disabled={pending}
                  onClick={() => setConfirmingId(null)}
                >
                  Keep
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="gg-btn gg-btn-secondary gg-btn-block min-h-[44px]"
                onClick={() => setConfirmingId(m.id)}
              >
                Remove {name}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
