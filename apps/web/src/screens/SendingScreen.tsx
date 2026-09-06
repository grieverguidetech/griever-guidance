import { useEffect, useRef, useState } from 'react';
import type { useSendFlow } from '@griever/hooks';
import { buildSmsLink, isIOSUserAgent } from '@griever/hooks';
import type { Contact } from '@griever/shared';
import { CheckCircle, CircleDashed, MinusCircle, ShareNetwork } from '@phosphor-icons/react';

type Flow = ReturnType<typeof useSendFlow>;

interface Props {
  flow: Flow;
  contacts: Contact[];
}

const UNDO_WINDOW_MS = 2000;

/**
 * One contact at a time, from the griever's own accounts — not a bulk send.
 * "Open Messages" hands off to the device's own Messages app (an sms: link)
 * with the contact and message pre-filled; "Share" opens the OS share sheet
 * (Messenger, Instagram, WhatsApp, email — whatever's installed) with the
 * message text, and the griever picks both the app and the specific person
 * there themselves. Neither Facebook nor Instagram exposes an API to send a
 * message to a personal contact — there's no way to open either one already
 * addressed to a specific person the way sms: addresses a phone number, so
 * this is the one generic action rather than separate per-platform buttons.
 * Returning to this tab (detected via visibilitychange) assumes an sms:
 * handoff went through and auto-advances after a short undo window, rather
 * than asking "did that send?" for every one of what could be a dozen
 * people; a share sheet gives an actual resolve/dismiss signal, so that path
 * advances directly off the share (or copy) completing.
 */
export function SendingScreen({ flow, contacts }: Props) {
  const { sendJob, markActiveSent, markActiveSkipped } = flow;
  const [pendingAdvance, setPendingAdvance] = useState(false);
  const [advanceLabel, setAdvanceLabel] = useState<'sent' | 'shared' | 'copied'>('sent');
  const [shareError, setShareError] = useState<string | null>(null);
  const awaitingReturnRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  const active = sendJob?.recipients.find((r) => r.status === 'sending') ?? null;
  const activeContact = active ? contacts.find((c) => c.contactId === active.contactId) : null;

  // Shared by the sms: return path and the share/copy success path — same
  // "Sent to X · Undo" toast either way, so a share/clipboard hand-off gets
  // the same visible confirmation and change-your-mind window a text does,
  // instead of silently advancing.
  function startAdvanceToast(label: 'sent' | 'shared' | 'copied') {
    setAdvanceLabel(label);
    setPendingAdvance(true);
    timerRef.current = window.setTimeout(() => {
      setPendingAdvance(false);
      markActiveSent();
    }, UNDO_WINDOW_MS);
  }

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState !== 'visible' || !awaitingReturnRef.current) return;
      awaitingReturnRef.current = false;
      startAdvanceToast('sent');
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markActiveSent]);

  // A fresh recipient became active (after the previous one advanced) —
  // any pending toast/timer/error belonged to the last person, not this one.
  useEffect(() => {
    setPendingAdvance(false);
    setShareError(null);
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

  // "Share" — for Facebook, Instagram, WhatsApp, or anything else the OS
  // offers. Neither Facebook nor Instagram has an API to open a chat with a
  // specific personal contact pre-addressed (Facebook's m.me links need a
  // username we don't have; Instagram's DM links can't carry the message
  // text at all) — the share sheet is the only real mechanism, and the user
  // picks who to send it to once inside whichever app they choose.
  function shareMessage() {
    if (!active) return;
    setShareError(null);
    if (typeof navigator.share === 'function') {
      // No await before this call — navigator.share() must fire directly
      // from the click's own gesture, not after any async work.
      navigator.share({ text: flow.composedMessage }).then(
        () => startAdvanceToast('shared'),
        (err: unknown) => {
          if (err instanceof DOMException && err.name === 'AbortError') return; // dismissed, not a failure
          setShareError("That didn't go through. You can try again.");
        },
      );
      return;
    }
    navigator.clipboard
      .writeText(flow.composedMessage)
      .then(() => startAdvanceToast('copied'))
      .catch(() => setShareError('Could not copy the message. You can select and copy it yourself.'));
  }

  return (
    <div className="flex flex-col gap-4 pt-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-[22px]">Reaching people, one at a time</h1>
        <p className="text-[13px] m-0" style={{ color: 'var(--text-muted)' }}>
          Text them, or share the message to Messenger, Instagram, or wherever else you'd reach
          them. You send it — we just line people up.
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

          {shareError && (
            <p className="text-[12px] m-0" style={{ color: 'var(--color-danger, #b91c1c)' }}>
              {shareError}
            </p>
          )}

          {pendingAdvance ? (
            <div className="flex items-center justify-between">
              <span className="text-[13px]" style={{ color: 'var(--color-accent-700)' }}>
                {advanceLabel === 'copied'
                  ? 'Copied'
                  : advanceLabel === 'shared'
                    ? `Shared for ${activeContact.name}`
                    : `Sent to ${activeContact.name}`}
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
              <button type="button" onClick={shareMessage} className="gg-btn gg-btn-secondary flex-1">
                <ShareNetwork size={16} weight="regular" />
                {typeof navigator.share === 'function' ? 'Share' : 'Copy message'}
              </button>
              <button type="button" onClick={markActiveSkipped} className="gg-btn gg-btn-ghost">
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
