import { useId } from 'react';
import { Check } from '@phosphor-icons/react/Check';
import { fill, screenCopy } from '@griever/copy';
import type { SectionKey } from '@griever/shared';
import { navTitle } from '../SideNav';

const copy = screenCopy('cmsShell');

interface Props {
  ready: boolean;
  onChange: (ready: boolean) => void;
  /** The next section still to do, or null when none is left. Only used once Ready. */
  nextSection?: SectionKey | null;
  /** Without it no continue button shows. */
  onNext?: () => void;
}

/** A toggle (the libs/ui Button has no icon slot, so this is a plain button). A check shows when ready;
 * the name never changes and aria-pressed carries the state. A toggle, not a one-way switch: the family can take "ready" back at any time.
 * Once ready, one button leads on: to the next section, or back to the Overview when nothing is left. */
export function MarkReady({ ready, onChange, nextSection = null, onNext }: Props) {
  const hintId = useId();
  return (
    <div className="flex flex-col gap-3 items-start">
      <p id={hintId}>{copy.readyHint}</p>
      <button
        type="button"
        className="gg-btn gg-btn-secondary min-h-[44px]"
        aria-pressed={ready}
        aria-describedby={hintId}
        onClick={() => onChange(!ready)}
      >
        {ready && <Check size={18} weight="bold" aria-hidden="true" />}
        {copy.markReady}
      </button>
      {ready && onNext ? (
        <button type="button" className="gg-btn gg-btn-primary min-h-[44px]" onClick={onNext}>
          {nextSection ? fill(copy.next, { section: navTitle(nextSection) }) : copy.backToOverview}
        </button>
      ) : null}
    </div>
  );
}
