import { screenCopy } from '@griever/copy';

const copy = screenCopy('cmsShell');

interface Props {
  ready: boolean;
  onChange: (ready: boolean) => void;
}

/** A toggle, not a one-way switch: the family can take "ready" back at any time. */
export function MarkReady({ ready, onChange }: Props) {
  return (
    <button
      type="button"
      className={`gg-btn ${ready ? 'gg-btn-primary' : 'gg-btn-secondary'}`}
      aria-pressed={ready}
      onClick={() => onChange(!ready)}
    >
      {copy.markReady}
    </button>
  );
}
