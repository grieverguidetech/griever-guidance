import type { useSendFlow } from '@griever/hooks';
import { CheckCircle } from '@phosphor-icons/react';

type Flow = ReturnType<typeof useSendFlow>;

interface Props {
  flow: Flow;
}

export function SentScreen({ flow }: Props) {
  const isAnnouncement = flow.templateCategory === 'announcement';
  const name = flow.session?.personName?.trim() || flow.fields['deceasedName']?.trim();
  const recipients = flow.sendJob?.recipients ?? [];
  const count = recipients.filter((r) => r.status === 'delivered').length;
  const skipped = recipients.filter((r) => r.status === 'skipped').length;
  const people = `${count} ${count === 1 ? 'person' : 'people'}`;

  return (
    <div className="flex flex-col items-center text-center gap-3 pt-16">
      <div
        className="flex items-center justify-center"
        style={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: 'var(--color-accent-100)',
        }}
      >
        <CheckCircle size={28} weight="duotone" style={{ color: 'var(--color-accent-700)' }} />
      </div>

      <h1 className="text-[22px] m-0">
        {isAnnouncement ? 'Everyone has been told.' : 'Your message has been sent.'}
      </h1>

      <p className="text-[14px] m-0" style={{ color: 'var(--text-muted)', maxWidth: '28ch' }}>
        {isAnnouncement
          ? `${people} now ${count === 1 ? 'knows' : 'know'} about ${name || 'your loved one'}. Nothing else needs doing today.`
          : `${people} ${count === 1 ? 'has' : 'have'} service details${name ? ` for ${name}` : ''}.`}
      </p>

      {skipped > 0 && (
        <p className="text-[12px] m-0" style={{ color: 'var(--text-hint)' }}>
          {skipped} {skipped === 1 ? 'person was' : 'people were'} skipped — you can text them any
          time from your own Messages app.
        </p>
      )}

      <p className="gg-reassure m-0 mb-4 text-[14px]">
        {isAnnouncement
          ? "Rest if you can. We'll keep the list for you."
          : "We're holding you in our thoughts."}
      </p>

      {isAnnouncement ? (
        <div className="gg-card w-full text-left">
          <span className="gg-card-kicker">When you're ready</span>
          <span className="gg-card-title text-[15px]">Share the service details</span>
          <p className="gg-card-body">We'll reuse this same list of people.</p>
          <button
            type="button"
            onClick={() => flow.restartForServiceDetails()}
            className="gg-btn gg-btn-primary gg-btn-block mt-2"
          >
            Add service details
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => flow.startAnotherMessage()}
          className="gg-btn gg-btn-ghost"
        >
          Send another message
        </button>
      )}

      <p className="text-[12px] m-0" style={{ color: 'var(--text-hint)' }}>
        We don't keep a copy of what was sent — it's already where it belongs, in your own
        Messages app.
      </p>
    </div>
  );
}
