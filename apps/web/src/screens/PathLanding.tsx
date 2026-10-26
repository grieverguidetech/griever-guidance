import { useRef, useState } from 'react';
import type { Session } from '@griever/hooks';
import { isDraftStarted, usePathMoments } from '@griever/hooks';
import type { MomentKey, TemplateCategory } from '@griever/shared';
import { doneRowMeta, fill, screenCopy } from '@griever/copy';
import { Hub, PaywallSheet } from '@griever/ui';
import type { HubRow } from '@griever/ui';
import { WhatYoullNeedSheet } from '../lib/WhatYoullNeedSheet';
import { formatDate } from '../lib/format';
import { PAYMENTS_ENABLED } from '../lib/features';
import { ShareDetailsButton } from './ShareDetailsButton';

const copy = screenCopy('pathLanding');
const paywallCopy = screenCopy('paywall');

/** The moments in the full plan. The announcement is free. */
const PAID_MOMENTS: MomentKey[] = ['service', 'thanks'];

const CATEGORY_BY_KEY: Record<MomentKey, TemplateCategory> = {
  announce: 'announcement',
  service: 'service',
  obituary: 'obituary',
  thanks: 'aftercare',
};

/** What the last send did, shown once on the path after the final person (#176). */
export interface FinishNote {
  moment: MomentKey;
  /** People handed the message. */
  told: number;
  /** People on the list, skipped ones included. */
  total: number;
}

export function finishNoteText({ moment, told, total }: FinishNote): string {
  if (told === 0) {
    return copy.finishNote.none;
  }
  if (told < total) {
    return fill(copy.finishNote.partial, { told, total });
  }
  return copy.finishNote.allTold[moment];
}

/** The C2 line applies only when something was sent. */
function showsNoCopyLine(note: FinishNote): boolean {
  return note.told > 0;
}

/** What the screen-reader region says: the same words as the visible note. */
export function finishNoteSpoken(note: FinishNote): string {
  return showsNoCopyLine(note) ? `${finishNoteText(note)} ${copy.finishNote.noCopy}` : finishNoteText(note);
}

interface Props {
  session: Session;
  onBack: () => void;
  onStartMoment: (key: MomentKey) => void;
  onEditPerson: () => void;
  note?: FinishNote | null;
  onCloseNote?: () => void;
  /** Defaults to the build flag; a prop so tests can set it. */
  paymentsEnabled?: boolean;
}

/** The hub is the shared screen in libs/ui; this holds what is web only: the sheets, focus and sharing. */
export function PathLanding({
  session,
  onBack,
  onStartMoment,
  onEditPerson,
  note = null,
  onCloseNote,
  paymentsEnabled = PAYMENTS_ENABLED,
}: Props) {
  const moments = usePathMoments(session);
  // Refs are loose on purpose: the shared components hand back a DOM node on web.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const heading = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const checklistButton = useRef<any>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  // The Close button leaves the page, so focus goes to the heading rather than being lost.
  function closeNote() {
    onCloseNote?.();
    heading.current?.setAttribute('tabindex', '-1');
    heading.current?.focus();
  }

  // The dialog hands focus back to the locked row that opened it.
  const opener = useRef<HTMLElement | null>(null);
  function openPaywall(row: HTMLElement) {
    opener.current = row;
    setPaywallOpen(true);
  }
  function closePaywall() {
    setPaywallOpen(false);
    // A click on the dim area moves focus to the page after this handler runs, so put it back once that is done.
    setTimeout(() => opener.current?.focus(), 0);
  }

  const rows: HubRow[] = moments.map((moment) => {
    const started = isDraftStarted(session.drafts[CATEGORY_BY_KEY[moment.key]]);
    return {
      key: moment.key,
      status: moment.status,
      started,
      locked: paymentsEnabled && PAID_MOMENTS.includes(moment.key),
      meta:
        moment.status === 'done'
          ? doneRowMeta(copy, {
              recipientCount: moment.recipientCount,
              dateLabel: moment.completedAt ? formatDate(moment.completedAt) : undefined,
              started,
            })
          : undefined,
    };
  });

  return (
    <div className="flex flex-col gap-4 pt-[52px] min-h-full">
      <Hub
        copy={copy}
        eyebrow={fill(copy.forName, { name: session.personName })}
        rows={rows}
        onBack={onBack}
        onWhatYoullNeed={() => setSheetOpen(true)}
        onEdit={onEditPerson}
        onStart={onStartMoment}
        onLocked={(row) => openPaywall(row as HTMLElement)}
        headingRef={heading}
        checklistRef={checklistButton}
        footer={
          <ShareDetailsButton
            session={session}
            checklist={moments.map((m) => ({
              label: copy.moments[m.key].title,
              done: m.status === 'done',
            }))}
          />
        }
      >
        <FinishNoteCard note={note} onClose={closeNote} />
      </Hub>
      {sheetOpen && <WhatYoullNeedSheet onClose={() => setSheetOpen(false)} returnFocusRef={checklistButton} />}
      {paywallOpen && <PaywallSheet copy={paywallCopy} onClose={closePaywall} returnFocusRef={opener} />}
    </div>
  );
}

/**
 * The visible note. It is spoken by the status region in App, which stays mounted across screens
 * and is filled after the heading takes focus, so this card is plain content. No motion.
 */
function FinishNoteCard({ note, onClose }: { note: FinishNote | null; onClose: () => void }) {
  if (!note) {
    return null;
  }
  return (
    <div className="gg-card">
      <p className="m-0 text-[14px]">{finishNoteText(note)}</p>
      {showsNoCopyLine(note) && <p className="gg-reassure m-0 text-[12px]">{copy.finishNote.noCopy}</p>}
      <button
        type="button"
        onClick={onClose}
        aria-label={copy.finishNote.closeLabel}
        className="gg-btn gg-btn-secondary gg-btn-bar self-start"
      >
        {copy.finishNote.close}
      </button>
    </div>
  );
}
