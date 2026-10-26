import type { RefObject } from 'react';
import { Sheet } from '@griever/ui';
import { ChecklistRows } from './ChecklistRows';

/** The "What you'll need" checklist in a sheet. Ticks are the same saved ticks as the full screen. */
export function WhatYoullNeedSheet({ onClose, returnFocusRef }: { onClose: () => void; returnFocusRef?: RefObject<HTMLElement | null> }) {
  return (
    <Sheet title="What you'll need" closeLabel="Close" onClose={onClose} returnFocusRef={returnFocusRef}>
      <p className="text-[13px] m-0" style={{ color: 'var(--text-muted)' }}>
        Not today. Just so none of it surprises you.
      </p>
      <div className="gg-card">
        <span className="gg-card-kicker">The one people get wrong</span>
        <span className="gg-card-title text-[15px]">Certified death certificates</span>
        <p className="gg-card-body m-0">
          Ask the funeral home for <strong>8 to 10 certified copies</strong>. Banks, insurers and
          Social Security each keep an original — photocopies are usually refused.
        </p>
      </div>
      <div className="flex flex-col gap-3">
        <p className="gg-eyebrow m-0">Gather when you can</p>
        <ChecklistRows />
      </div>
      <p className="gg-reassure text-center m-0 text-[12px]">We won't remind you about this list.</p>
    </Sheet>
  );
}
