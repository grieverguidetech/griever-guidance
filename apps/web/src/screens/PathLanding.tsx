import { useEffect, useState } from 'react';
import type { Session } from '@griever/hooks';
import { isDraftStarted, usePathMoments } from '@griever/hooks';
import type { Moment, MomentKey, TemplateCategory } from '@griever/shared';
import { PencilSimple } from '@phosphor-icons/react/PencilSimple';
import { CheckCircle } from '@phosphor-icons/react/CheckCircle';
import { CircleDashed } from '@phosphor-icons/react/CircleDashed';
import { ListChecks } from '@phosphor-icons/react/ListChecks';
import { BackButton, Eyebrow } from '../lib/ui';
import { formatDate } from '../lib/format';
import { ShareDetailsButton } from './ShareDetailsButton';

const MOMENT_COPY: Record<MomentKey, { title: string; body: string; doneLabel: string }> = {
  announce: {
    title: 'Announce the passing',
    body: 'A gentle note letting people know.',
    doneLabel: 'Told close family',
  },
  service: {
    title: 'Share the service',
    body: "Once you've set the date with the funeral home.",
    doneLabel: 'Shared the service',
  },
  obituary: {
    title: 'Share the obituary',
    body: 'Most papers want it 1–3 days before the service.',
    doneLabel: 'Shared the obituary',
  },
  thanks: {
    title: 'Send thank-yous',
    body: 'Afterwards, for flowers and the people who came.',
    doneLabel: 'Sent thank-yous',
  },
};

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

const ALL_TOLD: Record<MomentKey, string> = {
  announce: 'Everyone has been told.',
  service: 'The service details have been shared.',
  obituary: 'The obituary has been shared.',
  thanks: 'Your thank-yous have been sent.',
};

export function finishNoteText({ moment, told, total }: FinishNote): string {
  if (told < total) {
    return `You told ${told} of ${total}. You can text the others from your own Messages app any time.`;
  }
  return ALL_TOLD[moment];
}

interface Props {
  session: Session;
  onBack: () => void;
  onStartMoment: (key: MomentKey) => void;
  onWhatYoullNeed: () => void;
  onEditPerson: () => void;
  note?: FinishNote | null;
  onCloseNote?: () => void;
}

export function PathLanding({
  session,
  onBack,
  onStartMoment,
  onWhatYoullNeed,
  onEditPerson,
  note = null,
  onCloseNote,
}: Props) {
  const moments = usePathMoments(session);

  return (
    <div className="flex flex-col gap-4 pt-[52px] min-h-full">
      <BackButton onClick={onBack} />
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-3">
          <Eyebrow name={session.personName} />
          <button type="button" onClick={onEditPerson} className="gg-btn gg-btn-ghost text-[12px]">
            <PencilSimple size={13} weight="regular" aria-hidden="true" />
            Edit person
          </button>
        </div>
        <h1 className="text-[22px]">One thing at a time.</h1>
        <p className="text-[13px] m-0" style={{ color: 'var(--text-muted)' }}>
          Here's what usually comes next.
        </p>
      </div>

      <FinishNoteRegion note={note} onClose={onCloseNote} />

      <button
        type="button"
        onClick={onWhatYoullNeed}
        className="gg-btn gg-btn-secondary gg-btn-block"
      >
        <ListChecks size={18} weight="duotone" aria-hidden="true" />
        What you'll need
      </button>

      <div className="flex flex-col gap-2">
        {moments.map((moment) => (
          <MomentRow
            key={moment.key}
            moment={moment}
            started={isDraftStarted(session.drafts[CATEGORY_BY_KEY[moment.key]])}
            onStart={() => onStartMoment(moment.key)}
          />
        ))}
      </div>

      <ShareDetailsButton
        session={session}
        checklist={moments.map((m) => ({
          label: MOMENT_COPY[m.key].title,
          done: m.status === 'done',
        }))}
      />
    </div>
  );
}

/**
 * The region is always in the page and its words arrive a render later, so a screen reader
 * announces them. The note stays until the person moves on or closes it. It has no motion.
 */
function FinishNoteRegion({ note, onClose }: { note: FinishNote | null; onClose?: () => void }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(note !== null);
  }, [note]);
  return (
    <div role="status">
      {note && ready && (
        <div className="gg-card">
          <p className="m-0 text-[14px]">{finishNoteText(note)}</p>
          <p className="gg-reassure m-0 text-[12px]">
            We don't keep a copy of what was sent — it's already where it belongs, in your own Messages app.
          </p>
          <button type="button" onClick={onClose} className="gg-btn gg-btn-ghost self-start">
            Close
          </button>
        </div>
      )}
    </div>
  );
}

function MomentRow({
  moment,
  started,
  onStart,
}: {
  moment: Moment;
  started: boolean;
  onStart: () => void;
}) {
  const copy = MOMENT_COPY[moment.key];

  if (moment.status === 'done') {
    // Tapping opens a new, empty message for this moment (C2: no old wording is kept).
    return (
      <button
        type="button"
        onClick={onStart}
        className="flex gap-3 items-start text-left"
        style={{ padding: 'var(--space-2) 0' }}
      >
        <CheckCircle
          size={22}
          weight="duotone"
          style={{ color: 'var(--color-accent-700)', marginTop: 1 }}
        />
        <div>
          <div className="text-[15px]" style={{ color: 'var(--color-neutral-700)' }}>
            {copy.doneLabel}
          </div>
          <div className="gg-card-meta">
            {moment.recipientCount ?? 0} {moment.recipientCount === 1 ? 'person' : 'people'}
            {moment.completedAt ? ` · ${formatDate(moment.completedAt)}` : ''}
            {started ? ' · Started' : ' · Send again'}
          </div>
        </div>
      </button>
    );
  }

  if (moment.status === 'next') {
    return (
      <div className="gg-card elev-md gg-card-selected">
        <span className="gg-tag gg-tag-accent self-start">{started ? 'Started' : 'Next'}</span>
        <span className="gg-card-title">{copy.title}</span>
        <p className="gg-card-body m-0">{copy.body}</p>
        <button type="button" onClick={onStart} className="gg-btn gg-btn-primary gg-btn-block mt-2">
          {started ? 'Continue' : 'Start'}
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onStart}
      className="flex gap-3 items-start text-left"
      style={{ padding: 'var(--space-2) 0' }}
    >
      <CircleDashed
        size={22}
        weight="duotone"
        style={{ color: 'var(--color-neutral-500)', marginTop: 1 }}
      />
      <div>
        <div className="text-[15px]" style={{ color: 'var(--color-neutral-700)' }}>
          {copy.title}
          {started && <span className="gg-card-meta"> · Started</span>}
        </div>
        <p className="m-0 mt-[2px] text-[13px] leading-[1.5]" style={{ color: 'var(--color-neutral-800)' }}>
          {copy.body}
        </p>
      </div>
    </button>
  );
}
