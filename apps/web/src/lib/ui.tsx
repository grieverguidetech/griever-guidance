import { ArrowLeft } from '@phosphor-icons/react';

/** Ghost "Back" affordance — flush left, zero left padding, per the handoff. */
export function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="gg-btn gg-btn-ghost self-start !px-0">
      <ArrowLeft size={16} weight="regular" />
      Back
    </button>
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
