import { useId, useRef, useState } from 'react';
import type { Session } from '@griever/hooks';
import { isDraftStarted, usePathMoments } from '@griever/hooks';
import type { Moment, MomentKey, TemplateCategory } from '@griever/shared';
import { PencilSimple } from '@phosphor-icons/react/PencilSimple';
import { CheckCircle } from '@phosphor-icons/react/CheckCircle';
import { CircleDashed } from '@phosphor-icons/react/CircleDashed';
import { ListChecks } from '@phosphor-icons/react/ListChecks';
import { Lock } from '@phosphor-icons/react/Lock';
import { BackButton, Eyebrow } from '../lib/ui';
import { formatDate } from '../lib/format';
import { PAYMENTS_ENABLED } from '../lib/features';
import { ShareDetailsButton } from './ShareDetailsButton';
import { LOCKED_REASON, PaywallPlaceholder } from './PaywallPlaceholder';

/** The moments in the full plan. The announcement is free. */
const PAID_MOMENTS: MomentKey[] = ['service', 'thanks'];

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

const NO_COPY_LINE =
  "We don't keep a copy of what was sent — it's already where it belongs, in your own Messages app.";

export function finishNoteText({ moment, told, total }: FinishNote): string {
  if (told === 0) return 'No one was texted this time. You can come back to this any time.';
  if (told < total) {
    return `You told ${told} of ${total}. You can text the others from your own Messages app any time.`;
  }
  return ALL_TOLD[moment];
}

/** The C2 line applies only when something was sent. */
function showsNoCopyLine(note: FinishNote): boolean {
  return note.told > 0;
}

/** What the screen-reader region says: the same words as the visible note. */
export function finishNoteSpoken(note: FinishNote): string {
  return showsNoCopyLine(note) ? `${finishNoteText(note)} ${NO_COPY_LINE}` : finishNoteText(note);
}

interface Props {
  session: Session;
  onBack: () => void;
  onStartMoment: (key: MomentKey) => void;
  onWhatYoullNeed: () => void;
  onEditPerson: () => void;
  note?: FinishNote | null;
  onCloseNote?: () => void;
  /** Defaults to the build flag; a prop so tests can set it. */
  paymentsEnabled?: boolean;
}

export function PathLanding({
  session,
  onBack,
  onStartMoment,
  onWhatYoullNeed,
  onEditPerson,
  note = null,
  onCloseNote,
  paymentsEnabled = PAYMENTS_ENABLED,
}: Props) {
  const moments = usePathMoments(session);
  const heading = useRef<HTMLHeadingElement>(null);
  const [paywallOpen, setPaywallOpen] = useState(false);
  // The Close button leaves the page, so focus goes to the heading rather than being lost.
  function closeNote() {
    onCloseNote?.();
    heading.current?.setAttribute('tabindex', '-1');
    heading.current?.focus();
  }

  // The dialog hands focus back to the heading, which is not focusable until told so.
  function openPaywall() {
    heading.current?.setAttribute('tabindex', '-1');
    setPaywallOpen(true);
  }

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
        <h1 ref={heading} className="text-[22px]">
          One thing at a time.
        </h1>
        <p className="text-[13px] m-0" style={{ color: 'var(--text-muted)' }}>
          Here's what usually comes next.
        </p>
      </div>

      <FinishNoteCard note={note} onClose={closeNote} />

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
            locked={paymentsEnabled && PAID_MOMENTS.includes(moment.key)}
            onLockedPress={openPaywall}
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
      {paywallOpen && <PaywallPlaceholder onClose={() => setPaywallOpen(false)} returnFocusRef={heading} />}
    </div>
  );
}

/**
 * The visible note. It is spoken by the status region in App, which stays mounted across screens
 * and is filled after the heading takes focus, so this card is plain content. No motion.
 */
function FinishNoteCard({ note, onClose }: { note: FinishNote | null; onClose: () => void }) {
  if (!note) return null;
  return (
    <div className="gg-card">
      <p className="m-0 text-[14px]">{finishNoteText(note)}</p>
      {showsNoCopyLine(note) && <p className="gg-reassure m-0 text-[12px]">{NO_COPY_LINE}</p>}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close note"
        className="gg-btn gg-btn-secondary gg-btn-bar self-start"
      >
        Close
      </button>
    </div>
  );
}

function MomentRow({
  moment,
  started,
  onStart,
  locked,
  onLockedPress,
}: {
  moment: Moment;
  started: boolean;
  onStart: () => void;
  locked: boolean;
  onLockedPress: () => void;
}) {
  const copy = MOMENT_COPY[moment.key];

  if (locked) {
    return <LockedRow title={copy.title} body={copy.body} onPress={onLockedPress} />;
  }

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
          aria-hidden="true"
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

/**
 * A task in the full plan (#292). aria-disabled rather than disabled: it stays focusable and a screen
 * reader still reads it, with the reason. The text keeps full contrast; a tap opens the placeholder.
 */
function LockedRow({ title, body, onPress }: { title: string; body: string; onPress: () => void }) {
  const reasonId = useId();
  return (
    <button
      type="button"
      aria-disabled="true"
      aria-describedby={reasonId}
      onClick={onPress}
      className="flex gap-3 items-start text-left min-h-[44px]"
      style={{ padding: 'var(--space-2) 0' }}
    >
      <Lock size={22} weight="duotone" aria-hidden="true" style={{ color: 'var(--color-neutral-700)', marginTop: 1 }} />
      <div>
        <div className="text-[15px]" style={{ color: 'var(--color-neutral-800)' }}>
          {title}
        </div>
        <p className="m-0 mt-[2px] text-[13px] leading-[1.5]" style={{ color: 'var(--color-neutral-800)' }}>
          {body}
        </p>
        <span id={reasonId} className="text-[12px]" style={{ color: 'var(--color-neutral-800)' }}>
          {LOCKED_REASON}
        </span>
      </div>
    </button>
  );
}
