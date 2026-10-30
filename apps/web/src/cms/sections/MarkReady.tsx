import { Check } from '@phosphor-icons/react/Check';
import { screenCopy } from '@griever/copy';

const copy = screenCopy('cmsShell');

interface Props {
  ready: boolean;
  onChange: (ready: boolean) => void;
}

/** A toggle (the libs/ui Button has no icon slot, so this is a plain button). A check shows when ready;
 * the name never changes and aria-pressed carries the state. A toggle, not a one-way switch: the family can take "ready" back at any time. */
export function MarkReady({ ready, onChange }: Props) {
  return (
    <button
      type="button"
      className="gg-btn gg-btn-secondary"
      aria-pressed={ready}
      onClick={() => onChange(!ready)}
    >
      {ready && <Check size={18} weight="bold" aria-hidden="true" />}
      {copy.markReady}
    </button>
  );
}
