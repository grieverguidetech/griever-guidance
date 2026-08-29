import type { Session } from '@griever/hooks';
import { draftStageLabel, formatRelativeTime } from '../lib/format';

interface Props {
  inProgressSessions: Session[];
  onNewSession: () => void;
  onContinueSession: (id: string) => void;
  onViewHistory: () => void;
  onWriteObituary: () => void;
}

export function Landing({
  inProgressSessions,
  onNewSession,
  onContinueSession,
  onViewHistory,
  onWriteObituary,
}: Props) {
  const returning = inProgressSessions.length > 0;
  const [current, ...rest] = inProgressSessions;
  const senderFirstName = current?.senderName.trim().split(/\s+/)[0] ?? '';

  return (
    <div className="flex flex-col gap-6 pt-14">
      <div className="flex flex-col gap-2">
        <h1 className="text-[32px] leading-[1.1]">
          {returning
            ? `Welcome back${senderFirstName ? `, ${senderFirstName}` : ''}.`
            : 'Griever Guidance'}
        </h1>
        <p className="text-[14px] leading-[1.6] m-0" style={{ color: 'var(--text-muted)' }}>
          {returning
            ? "You have a message in progress. It's saved just as you left it."
            : "We'll help you tell people what they need to know, one message at a time."}
        </p>
      </div>

      {returning && current && (
        <div className="gg-card elev-md gg-card-selected">
          <span className="gg-card-kicker">In progress</span>
          <span className="gg-card-title">{current.personName || "Someone I've lost"}</span>
          <p className="gg-card-body">
            {current.draft ? draftStageLabel(current.draft) : 'Just started, not yet sent.'}
          </p>
          <span className="gg-card-meta">
            Last opened {formatRelativeTime(current.lastOpenedAt)}
          </span>
          <button
            type="button"
            onClick={() => onContinueSession(current.id)}
            className="gg-btn gg-btn-primary gg-btn-block mt-2"
          >
            Continue
          </button>
        </div>
      )}

      {rest.map((session) => (
        <button
          key={session.id}
          type="button"
          onClick={() => onContinueSession(session.id)}
          className="gg-card elev-sm gg-card-selectable text-left"
        >
          <span className="gg-card-kicker">In progress</span>
          <span className="gg-card-title text-[15px]">
            {session.personName || "Someone I've lost"}
          </span>
          <span className="gg-card-meta">
            Last opened {formatRelativeTime(session.lastOpenedAt)}
          </span>
        </button>
      ))}

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={onNewSession}
          className="gg-card elev-sm gg-card-selectable text-left"
        >
          <span className="gg-card-title">
            {returning ? "Someone else I've lost" : "Someone I've lost"}
          </span>
          <span className="gg-card-body">
            {returning
              ? 'Start a new set of messages.'
              : "Tell us their name once. We'll remember it for every message you send."}
          </span>
        </button>
        <button
          type="button"
          onClick={onViewHistory}
          className="gg-card elev-sm gg-card-selectable text-left"
        >
          <span className="gg-card-title">Messages I've sent</span>
          <span className="gg-card-body">A record of everything that's gone out.</span>
        </button>
      </div>

      {!returning && (
        <p className="gg-reassure m-0 text-[12px]">
          Nothing sends until you've read it first.
        </p>
      )}

      <button
        type="button"
        onClick={onWriteObituary}
        className="gg-btn gg-btn-ghost self-start !min-h-0 !px-0 text-[12px]"
      >
        Write an obituary
      </button>
    </div>
  );
}
