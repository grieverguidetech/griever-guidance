import { useState } from 'react';
import { TopBar } from '../lib/ui';

interface Props {
  onBack: () => void;
  /** Resolves once everything is gone. The app then returns to its first screen. */
  onRemoveEverything: () => Promise<void>;
}

/** Settings is the only place deletion is offered (C9): never inside a flow, never a swipe. */
export function Settings({ onBack, onRemoveEverything }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function remove() {
    if (pending) return;
    setPending(true);
    setFailed(false);
    try {
      await onRemoveEverything();
    } catch {
      setFailed(true);
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <TopBar onBack={onBack} />
      <h1 className="text-[22px]">Settings</h1>

      <section
        aria-labelledby="remove-heading"
        className="flex flex-col gap-3 pt-4"
        style={{ borderTop: '1px solid var(--color-divider)', marginTop: 'var(--space-4)' }}
      >
        <h2 id="remove-heading" className="text-[16px] m-0">
          Remove everything from this device
        </h2>
        {!confirming ? (
          <>
            <p className="text-[14px] leading-[1.6] m-0" style={{ color: 'var(--text-muted)' }}>
              Useful on a shared phone. Your account stays as it is.
            </p>
            <button
              type="button"
              className="gg-btn gg-btn-secondary gg-btn-block"
              onClick={() => setConfirming(true)}
            >
              Remove everything from this device
            </button>
          </>
        ) : (
          <div role="group" aria-labelledby="remove-confirm" className="flex flex-col gap-3">
            <p id="remove-confirm" className="text-[14px] leading-[1.6] m-0">
              This removes the people you're writing about, your contacts, and your drafts from this
              device. It can't be undone. Nothing is removed from anyone else's phone.
            </p>
            <button
              type="button"
              className="gg-btn gg-btn-primary gg-btn-block"
              onClick={() => void remove()}
              aria-disabled={pending}
            >
              Remove everything
            </button>
            <button
              type="button"
              className="gg-btn gg-btn-secondary gg-btn-block"
              onClick={() => {
                setConfirming(false);
                setFailed(false);
              }}
              disabled={pending}
            >
              Keep everything
            </button>
          </div>
        )}
        <div role="status" aria-live="polite" className="text-[13px]">
          {failed && "That didn't finish. You can try again."}
        </div>
      </section>
    </div>
  );
}
