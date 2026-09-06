import { useState } from 'react';
import type { useSendFlow } from '@griever/hooks';
import { buildSmsLink, isIOSUserAgent, smsHandoffPlausible } from '@griever/hooks';
import type { Contact } from '@griever/shared';
import { CheckCircle, CircleDashed, MinusCircle } from '@phosphor-icons/react';

type Flow = ReturnType<typeof useSendFlow>;

interface Props {
  flow: Flow;
  contacts: Contact[];
}

/**
 * One contact at a time, texted from the griever's own number — not a bulk
 * send. Tapping "Open Messages" hands off to the device's own Messages app
 * (an sms: link) with the contact and message pre-filled; the griever taps
 * Send there themselves, which is the one thing no page can do on their
 * behalf. There is no delivery signal to read, so the app asks once,
 * quietly: "did that go through?" — Yes / Not yet / Try again. Never
 * inferred from a timer or from the tab being backgrounded
 * (tasks/04-sending.md §4).
 */
export function SendingScreen({ flow, contacts }: Props) {
  const { sendJob, handOffActive, confirmActive, skipActive } = flow;
  const [error, setError] = useState<string | null>(null);

  if (!sendJob) return null;

  const { entries, cursorIndex } = sendJob;
  const active = entries[cursorIndex] ?? null;
  const activeContact = active ? contacts.find((c) => c.contactId === active.contactId) : null;
  const total = entries.length;
  const done = entries.filter((e) => e.status === 'confirmed' || e.status === 'skipped').length;
  const nameFor = (id: string) => contacts.find((c) => c.contactId === id)?.name ?? 'Recipient';

  if (!smsHandoffPlausible(navigator.userAgent, typeof matchMedia === 'function' ? matchMedia : undefined)) {
    return (
      <div className="flex flex-col gap-4 pt-8">
        <h1 className="text-[22px]">Open this on your phone to send</h1>
        <p className="text-[13px] m-0" style={{ color: 'var(--text-muted)' }}>
          Texting each person from your own number only works from a phone with Messages installed.
          Everything up to here is saved — pick up where you left off on your phone.
        </p>
      </div>
    );
  }

  async function openMessages() {
    if (!active || !activeContact) return;
    setError(null);
    try {
      await handOffActive();
      window.location.href = buildSmsLink(activeContact.phone, flow.composedMessage, isIOSUserAgent(navigator.userAgent));
    } catch {
      setError("We couldn't open Messages. You can try again.");
    }
  }

  return (
    <div className="flex flex-col gap-4 pt-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-[22px]">Texting people, one at a time</h1>
        <p className="text-[13px] m-0" style={{ color: 'var(--text-muted)' }}>
          Each message opens in your own Messages app. You send it — we just line them up.
        </p>
      </div>

      <div
        className="h-[6px] overflow-hidden"
        style={{ background: 'var(--color-neutral-200)', borderRadius: 'var(--radius-sm)' }}
      >
        <div
          style={{
            width: `${total === 0 ? 0 : (done / total) * 100}%`,
            height: '100%',
            background: 'var(--color-accent)',
            transition: 'width 300ms ease',
          }}
        />
      </div>

      {active && activeContact && (
        <div className="gg-card flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <span className="gg-eyebrow m-0">
              {cursorIndex + 1} of {total}
            </span>
            <span className="gg-card-title text-[16px]">{activeContact.name}</span>
          </div>
          <p className="gg-card-body m-0 whitespace-pre-wrap" style={{ opacity: 1, fontSize: 13, lineHeight: 1.6 }}>
            {flow.composedMessage}
          </p>

          {error && (
            <p className="text-[12px] m-0" style={{ color: 'var(--color-danger, #b91c1c)' }}>
              {error}
            </p>
          )}

          {active.status === 'handed_off' ? (
            <div className="flex flex-col gap-2">
              <span className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
                Did that go through?
              </span>
              <div className="flex gap-2">
                <button type="button" onClick={() => confirmActive(true)} className="gg-btn gg-btn-primary flex-1">
                  Yes
                </button>
                <button type="button" onClick={() => confirmActive(false)} className="gg-btn gg-btn-secondary flex-1">
                  Not yet
                </button>
                <button type="button" onClick={openMessages} className="gg-btn gg-btn-ghost">
                  Try again
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button type="button" onClick={openMessages} className="gg-btn gg-btn-primary flex-1">
                Open Messages
              </button>
              <button type="button" onClick={skipActive} className="gg-btn gg-btn-secondary">
                Skip
              </button>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2">
        {entries.map((entry, i) => {
          if (i === cursorIndex) return null;
          return (
            <div key={entry.contactId} className="flex items-center justify-between text-[14px]">
              <span>{nameFor(entry.contactId)}</span>
              {entry.status === 'confirmed' ? (
                <span className="flex items-center gap-[6px]" style={{ color: 'var(--color-accent-700)' }}>
                  <CheckCircle size={16} weight="duotone" />
                  Sent
                </span>
              ) : entry.status === 'skipped' ? (
                <span className="flex items-center gap-[6px]" style={{ color: 'var(--text-hint)' }}>
                  <MinusCircle size={16} weight="duotone" />
                  Skipped
                </span>
              ) : entry.status === 'handed_off' ? (
                <span className="flex items-center gap-[6px]" style={{ color: 'var(--text-hint)' }}>
                  <MinusCircle size={16} weight="duotone" />
                  Not confirmed
                </span>
              ) : (
                <span className="flex items-center gap-[6px]" style={{ color: 'var(--text-hint)' }}>
                  <CircleDashed size={16} weight="duotone" />
                  Waiting
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
