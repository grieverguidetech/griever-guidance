import { useId } from 'react';
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
        // The darker accent keeps this AA (5.7:1); the base accent is 3.65:1.
        style={{ color: 'var(--color-accent-700)' }}
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
