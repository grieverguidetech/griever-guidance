import type { RefObject } from 'react';
import { Sheet } from '@griever/ui';
import { ChecklistRows } from './ChecklistRows';
import { DeathCertificateCard, GATHER_HEADING, NO_REMINDER_LINE } from './DeathCertificateCard';

/** The "What you'll need" checklist in a sheet. Ticks are the same saved ticks as the full screen. */
export function WhatYoullNeedSheet({ onClose, returnFocusRef }: { onClose: () => void; returnFocusRef?: RefObject<HTMLElement | null> }) {
  return (
    <Sheet title="What you'll need" closeLabel="Close" onClose={onClose} returnFocusRef={returnFocusRef}>
      <p className="text-[13px] m-0" style={{ color: 'var(--text-muted)' }}>
        Not today. Just so none of it surprises you.
      </p>
      <DeathCertificateCard />
      <div className="flex flex-col gap-3">
        <p className="gg-eyebrow m-0">{GATHER_HEADING}</p>
        <ChecklistRows />
      </div>
      <p className="gg-reassure text-center m-0 text-[12px]">{NO_REMINDER_LINE}</p>
    </Sheet>
  );
}
