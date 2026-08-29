import { useEffect } from 'react';
import type { useSendFlow } from '@griever/hooks';
import { useMockContacts } from '@griever/hooks';
import { CheckCircle, CircleDashed } from '@phosphor-icons/react';

type Flow = ReturnType<typeof useSendFlow>;

interface Props {
  flow: Flow;
}

const TICK_MS = 700;

export function SendingScreen({ flow }: Props) {
  const contacts = useMockContacts();
  const { sendJob, tickSendJob } = flow;

  useEffect(() => {
    if (!sendJob) return;
    const timer = window.setInterval(tickSendJob, TICK_MS);
    return () => window.clearInterval(timer);
  }, [sendJob, tickSendJob]);

  if (!sendJob) return null;

  const total = sendJob.recipients.length;
  const delivered = sendJob.recipients.filter((r) => r.status === 'delivered').length;
  const nameFor = (id: string) => contacts.find((c) => c.id === id)?.name ?? 'Recipient';

  return (
    <div className="flex flex-col gap-4 pt-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-[22px]">Sending your message…</h1>
        <p className="text-[13px] m-0" style={{ color: 'var(--text-muted)' }}>
          {delivered} of {total} delivered. You can close the app — it will finish on its own.
        </p>
      </div>

      <div
        className="h-[6px] overflow-hidden"
        style={{ background: 'var(--color-neutral-200)', borderRadius: 'var(--radius-sm)' }}
      >
        <div
          style={{
            width: `${total === 0 ? 0 : (delivered / total) * 100}%`,
            height: '100%',
            background: 'var(--color-accent)',
            transition: 'width 300ms ease',
          }}
        />
      </div>

      <div className="flex flex-col gap-2">
        {sendJob.recipients.map((r) => (
          <div key={r.contactId} className="flex items-center justify-between text-[14px]">
            <span>{nameFor(r.contactId)}</span>
            {r.status === 'delivered' ? (
              <span
                className="flex items-center gap-[6px]"
                style={{ color: 'var(--color-accent-700)' }}
              >
                <CheckCircle size={16} weight="duotone" />
                Delivered
              </span>
            ) : (
              <span
                className="flex items-center gap-[6px]"
                style={{ color: 'var(--text-hint)' }}
              >
                <CircleDashed size={16} weight="duotone" />
                Sending
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
