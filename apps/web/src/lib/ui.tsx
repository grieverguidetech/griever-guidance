import { useEffect, useId, useRef } from 'react';
import type { ReactElement } from 'react';
import { ArrowLeft, ListChecks } from '@phosphor-icons/react';
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

/** Ghost "Back" affordance — flush left, zero left padding, per the handoff. */
export function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="gg-btn gg-btn-ghost self-start !px-0">
      <ArrowLeft size={16} weight="regular" />
      Back
    </button>
  );
}

/**
 * Persistent top bar for every flow screen: back button on the left,
 * "What you'll need" link on the right. Keeps the checklist reachable
 * from anywhere in the flow per the demo-feedback ticket.
 */
export function TopBar({ onBack }: { onBack?: () => void }) {
  const onWhatYoullNeed = useWhatYoullNeed();
  return (
    <div className="flex items-center justify-between w-full">
      {onBack && <BackButton onClick={onBack} />}
      <button
        type="button"
        onClick={onWhatYoullNeed}
        className="gg-btn gg-btn-ghost !px-0"
      >
        <ListChecks size={16} weight="duotone" />
        What you'll need
      </button>
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
 * `<h1>` so a screen reader announces it. The first render and re-renders that
 * keep the same key never move focus. The heading is made focusable with
 * tabindex="-1" (not a tab stop); styles.css hides the ring on it.
 */
export function useFocusHeadingOnChange(key: string | undefined) {
  const previous = useRef(key);
  useEffect(() => {
    if (previous.current === key) return;
    previous.current = key;
    const heading = document.querySelector('h1');
    if (!heading) return;
    heading.setAttribute('tabindex', '-1');
    heading.focus();
  }, [key]);
}
