import { useEffect, useId, useRef } from 'react';
import type { ReactElement } from 'react';
import { ArrowLeft } from '@phosphor-icons/react/ArrowLeft';
import { ListChecks } from '@phosphor-icons/react/ListChecks';
import { useWhatYoullNeed } from './whatYoullNeedContext';

/**
 * Shows `text` above its child on hover or focus. The child is expected to
 * reference it via `aria-describedby={id}` (passed through the render prop), so
 * screen readers announce it too.
 */
export function Tooltip({ text, children }: { text: string; children: (id: string) => ReactElement }) {
  const id = useId();
  return (
    <span className="gg-tooltip">
      {children(id)}
      <span id={id} role="tooltip" className="gg-tooltip-text">
        {text}
      </span>
    </span>
  );
}

/** "Back" button: a visible border, at least 44 by 44, with the shared focus ring (#176). */
export function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="gg-btn gg-btn-secondary gg-btn-bar self-start">
      <ArrowLeft size={16} weight="regular" aria-hidden="true" />
      Back
    </button>
  );
}

/**
 * Persistent top bar for every flow screen: back button on the left,
 * "What you'll need" link on the right. Keeps the checklist reachable
 * from anywhere in the flow per the demo-feedback ticket.
 */
export function TopBar({ onBack, hideChecklist = false }: { onBack?: () => void; hideChecklist?: boolean }) {
  const onWhatYoullNeed = useWhatYoullNeed();
  return (
    <div className="flex items-center justify-between w-full">
      {onBack && <BackButton onClick={onBack} />}
      {!hideChecklist && (
        <button
          type="button"
          onClick={onWhatYoullNeed}
          className="gg-btn gg-btn-secondary gg-btn-bar"
        >
          <ListChecks size={16} weight="duotone" aria-hidden="true" />
          What you'll need
        </button>
      )}
    </div>
  );
}

/** The "FOR <NAME>" accent eyebrow shown on every screen once a session exists. */
export function Eyebrow({ name, accent2 = false }: { name: string; accent2?: boolean }) {
  return (
    <p
      className="m-0 text-[11px] uppercase"
      style={{
        letterSpacing: '0.1em',
        color: accent2 ? 'var(--color-accent-2-700)' : 'var(--color-accent-700)',
      }}
    >
      For {name}
    </p>
  );
}

/** The one reassurance line (DS-3): everything typed is already on this device. */
export function SavedNote() {
  return (
    <p className="gg-reassure text-center m-0 text-[12px]">
      Everything is saved on this phone as you go. You can stop and come back.
    </p>
  );
}

/**
 * When `key` changes (a new view or flow step), moves focus to the new screen's
 * `<h1>` so a screen reader announces it. Until the person first presses, taps or
 * types, changes only update the recorded key: the app's own start-up redirects
 * (loading, then sign-in, then the right screen) are the initial screen, not
 * navigation. If the new screen has no h1 yet, the move waits and happens on the
 * first later render that has one. The heading is made focusable with
 * tabindex="-1" (not a tab stop); styles.css marks it differently from the ring.
 */
export function useFocusHeadingOnChange(key: string | undefined) {
  const interacted = useRef(false);
  const previous = useRef(key);
  const pending = useRef(false);
  useEffect(() => {
    const events = ['pointerdown', 'keydown', 'click'] as const;
    const mark = () => {
      interacted.current = true;
      events.forEach((e) => document.removeEventListener(e, mark, true));
    };
    events.forEach((e) => document.addEventListener(e, mark, true));
    return () => events.forEach((e) => document.removeEventListener(e, mark, true));
  }, []);
  useEffect(() => {
    if (previous.current !== key) {
      previous.current = key;
      pending.current = interacted.current;
    }
    if (!pending.current) return;
    const heading = document.querySelector('h1');
    if (!heading) return;
    pending.current = false;
    heading.setAttribute('tabindex', '-1');
    heading.focus();
  });
}
