import { useEffect, useRef, useState } from 'react';
import type { useSendFlow } from '@griever/hooks';
import { buildSmsLink, isIOSUserAgent } from '@griever/hooks';
import type { Contact } from '@griever/shared';
import { CheckCircle, CircleDashed, MinusCircle } from '@phosphor-icons/react';

type Flow = ReturnType<typeof useSendFlow>;

interface Props {
  flow: Flow;
  contacts: Contact[];
}

const UNDO_WINDOW_MS = 2000;

/**
 * One contact at a time, texted from the griever's own number — not a bulk
 * send. Tapping "Open Messages" hands off to the device's own Messages app
 * (an sms: link) with the contact and message pre-filled; the griever taps
 * Send there themselves, which is the one thing no web page can do on their
 * behalf. Returning to this tab (detected via visibilitychange) assumes it
 * went through and auto-advances after a short undo window, rather than
 * asking "did that send?" for every one of what could be a dozen people.
 */
export function SendingScreen({ flow, contacts }: Props) {
  const { sendJob, markActiveSent, markActiveSkipped } = flow;
  const [pendingAdvance, setPendingAdvance] = useState(false);
  const awaitingReturnRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  const active = sendJob?.recipients.find((r) => r.status === 'sending') ?? null;
  const activeContact = active ? contacts.find((c) => c.contactId === active.contactId) : null;

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState !== 'visible' || !awaitingReturnRef.current) return;
      awaitingReturnRef.current = false;
      setPendingAdvance(true);
      timerRef.current = window.setTimeout(() => {
        setPendingAdvance(false);
        markActiveSent();
      }, UNDO_WINDOW_MS);
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [markActiveSent]);

  // A fresh recipient became active (after the previous one advanced) —
  // any pending toast/timer belonged to the last person, not this one.
  useEffect(() => {
    setPendingAdvance(false);
    awaitingReturnRef.current = false;
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, [active?.contactId]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  if (!sendJob) return null;

  const total = sendJob.recipients.length;
  const done = sendJob.recipients.filter((r) => r.status === 'delivered' || r.status === 'skipped').length;
  const activeIndex = active ? sendJob.recipients.findIndex((r) => r.contactId === active.contactId) : -1;
  const nameFor = (id: string) => contacts.find((c) => c.contactId === id)?.name ?? 'Recipient';

  function undo() {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setPendingAdvance(false);
  }

  function openMessages() {
    if (!active || !activeContact) return;
    const link = buildSmsLink(activeContact.phone, flow.composedMessage, isIOSUserAgent(navigator.userAgent));
    awaitingReturnRef.current = true;
    window.location.href = link;
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
              {activeIndex + 1} of {total}
            </span>
            <span className="gg-card-title text-[16px]">{activeContact.name}</span>
          </div>
          <p className="gg-card-body m-0 whitespace-pre-wrap" style={{ opacity: 1, fontSize: 13, lineHeight: 1.6 }}>
            {flow.composedMessage}
          </p>

          {pendingAdvance ? (
            <div className="flex items-center justify-between">
              <span className="text-[13px]" style={{ color: 'var(--color-accent-700)' }}>
                Sent to {activeContact.name}
              </span>
              <button type="button" onClick={undo} className="gg-btn gg-btn-ghost !min-h-0">
                Undo
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <button type="button" onClick={openMessages} className="gg-btn gg-btn-primary flex-1">
                Open Messages
              </button>
              <button type="button" onClick={markActiveSkipped} className="gg-btn gg-btn-secondary">
                Skip
              </button>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2">
        {sendJob.recipients.map((r) => {
          if (r.contactId === active?.contactId) return null;
          return (
            <div key={r.contactId} className="flex items-center justify-between text-[14px]">
              <span>{nameFor(r.contactId)}</span>
              {r.status === 'delivered' ? (
                <span className="flex items-center gap-[6px]" style={{ color: 'var(--color-accent-700)' }}>
                  <CheckCircle size={16} weight="duotone" />
                  Sent
                </span>
              ) : r.status === 'skipped' ? (
                <span className="flex items-center gap-[6px]" style={{ color: 'var(--text-hint)' }}>
                  <MinusCircle size={16} weight="duotone" />
                  Skipped
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
