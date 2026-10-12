import { useEffect, useRef, useState } from 'react';
import type { useSendFlow } from '@griever/hooks';

type Flow = ReturnType<typeof useSendFlow>;
type Phase = 'idle' | 'confirm' | 'cleared';

/**
 * A quiet way to empty one moment's draft from its first form. Shown only when the draft holds
 * something. Focus moves to the confirm group, which announces its question; then back to the link on
 * Keep, or to the calm note on Clear (the link is gone by then because the draft is empty).
 */
export function StartAgain({ flow }: { flow: Flow }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const linkRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLDivElement>(null);
  const noteRef = useRef<HTMLParagraphElement>(null);
  const moved = useRef(false);

  const content = flow.hasDraftContent;
  const shown = content ? (phase === 'confirm' ? 'confirm' : 'link') : phase === 'cleared' ? 'note' : 'none';

  useEffect(() => {
    if (!moved.current) return;
    if (shown === 'confirm') confirmRef.current?.focus();
    else if (shown === 'note') noteRef.current?.focus();
    else if (shown === 'link') linkRef.current?.focus();
    moved.current = false;
  }, [shown]);

  function go(next: Phase) {
    moved.current = true;
    setPhase(next);
  }

  if (shown === 'none') return null;

  if (shown === 'note') {
    return (
      <p ref={noteRef} tabIndex={-1} className="m-0 text-[13px]" style={{ color: 'var(--text-muted)' }}>
        This message is empty again.
      </p>
    );
  }

  if (shown === 'confirm') {
    return (
      <div ref={confirmRef} tabIndex={-1} role="group" aria-labelledby="start-again-question" className="gg-card">
        <p id="start-again-question" className="gg-card-body m-0" style={{ opacity: 1, fontSize: 14 }}>
          Clear what you've written for this message? People and contacts stay as they are.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            className="gg-btn gg-btn-secondary"
            onClick={() => {
              flow.startAgain();
              go('cleared');
            }}
          >
            Clear it
          </button>
          <button type="button" className="gg-btn gg-btn-ghost" onClick={() => go('idle')}>
            Keep it
          </button>
        </div>
      </div>
    );
  }

  return (
    <button ref={linkRef} type="button" className="gg-btn gg-btn-ghost self-start !px-0" onClick={() => go('confirm')}>
      Start this message again
    </button>
  );
}
