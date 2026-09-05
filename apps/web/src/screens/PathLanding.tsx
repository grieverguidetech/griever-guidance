import type { Session } from '@griever/hooks';
import { usePathMoments } from '@griever/hooks';
import type { Moment, MomentKey } from '@griever/shared';
import { CheckCircle, CircleDashed, ListChecks } from '@phosphor-icons/react';
import { Eyebrow } from '../lib/ui';
import { formatDate } from '../lib/format';

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

interface Props {
  session: Session;
  otherSessions: Session[];
  onStartMoment: (key: MomentKey) => void;
  onWhatYoullNeed: () => void;
  onViewHistory: () => void;
  onNewSession: () => void;
}

export function PathLanding({
  session,
  otherSessions,
  onStartMoment,
  onWhatYoullNeed,
  onViewHistory,
  onNewSession,
}: Props) {
  const moments = usePathMoments(session);

  return (
    <div className="flex flex-col gap-4 pt-[52px] min-h-full">
      <div className="flex flex-col gap-1">
        <Eyebrow name={session.personName} />
        <h1 className="text-[22px]">One thing at a time.</h1>
        <p className="text-[13px] m-0" style={{ color: 'var(--text-muted)' }}>
          Here's what usually comes next.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {moments.map((moment) => (
          <MomentRow key={moment.key} moment={moment} onStart={() => onStartMoment(moment.key)} />
        ))}
      </div>

      {otherSessions.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="gg-eyebrow m-0">Other people you're writing about</p>
          {otherSessions.map((s) => (
            <div key={s.id} className="text-[14px]" style={{ color: 'var(--text-muted)' }}>
              {s.personName || "Someone I've lost"}
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col" style={{ gap: '2px', marginTop: 'auto', paddingTop: 'var(--space-4)' }}>
        <button type="button" onClick={onWhatYoullNeed} className="gg-btn gg-btn-ghost !px-0 self-start">
          <ListChecks size={16} weight="duotone" />
          What you'll need
        </button>
        <button
          type="button"
          onClick={onViewHistory}
          className="gg-btn gg-btn-ghost !px-0 self-start"
          style={{ color: 'var(--color-neutral-700)' }}
        >
          Messages I've sent
        </button>
        <button
          type="button"
          onClick={onNewSession}
          className="gg-btn gg-btn-ghost !px-0 self-start"
          style={{ color: 'var(--color-neutral-700)' }}
        >
          Someone else I've lost
        </button>
      </div>
    </div>
  );
}

function MomentRow({ moment, onStart }: { moment: Moment; onStart: () => void }) {
  const copy = MOMENT_COPY[moment.key];

  if (moment.status === 'done') {
    return (
      <div className="flex gap-3 items-start" style={{ padding: 'var(--space-2) 0' }}>
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
          </div>
        </div>
      </div>
    );
  }

  if (moment.status === 'next') {
    return (
      <div className="gg-card elev-md gg-card-selected">
        <span className="gg-tag gg-tag-accent self-start">Next</span>
        <span className="gg-card-title">{copy.title}</span>
        <p className="gg-card-body m-0">{copy.body}</p>
        <button type="button" onClick={onStart} className="gg-btn gg-btn-primary gg-btn-block mt-2">
          Start
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
        </div>
        <p className="m-0 mt-[2px] text-[13px] leading-[1.5]" style={{ color: 'var(--color-neutral-800)' }}>
          {copy.body}
        </p>
      </div>
    </button>
  );
}
