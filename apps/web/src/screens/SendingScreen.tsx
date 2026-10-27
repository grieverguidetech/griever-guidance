import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { useSendFlow } from '@griever/hooks';
import { buildSmsLink, isIOSUserAgent } from '@griever/hooks';
import type { Contact } from '@griever/shared';
import { fill, screenCopy } from '@griever/copy';
import { Sending } from '@griever/ui';
import type { ButtonNode } from '@griever/ui';
import { WhatYoullNeedSheet } from '../lib/WhatYoullNeedSheet';

type Flow = ReturnType<typeof useSendFlow>;

const copy = screenCopy('sending');

interface Props {
  flow: Flow;
  contacts: Contact[];
}

/** How this contact's message was handed off, once it has been. */
type HandOff = 'sms' | 'shared' | 'copied';

/**
 * The screen is the shared Sending in libs/ui; this holds what is web only: the sms: link, the
 * share sheet and the clipboard.
 *
 * One contact at a time, from the griever's own accounts, not a bulk send. The first button hands
 * off to the device's own Messages app (an sms: link) with the contact and message pre-filled.
 * The share button opens the OS share sheet with the message text and the griever picks the app and the
 * person there. Neither Facebook nor Instagram has an API to open a chat with a specific personal
 * contact, so the share sheet is the one generic action. Once handed off, Next moves on. It is
 * one tap, not a "did that send?" question. The app never infers a send from the tab being hidden
 * and shown again, which does not happen reliably (for example on a desktop).
 */
export function SendingScreen({ flow, contacts }: Props) {
  const { sendJob, markActiveSent, markActiveSkipped } = flow;
  const [handOff, setHandOff] = useState<HandOff | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  // The shared Button hands back a DOM node on web; its type says native node.
  const checklistButton = useRef<ButtonNode>(null);

  const active = sendJob?.recipients.find((r) => r.status === 'sending') ?? null;
  const activeContact = active ? contacts.find((c) => c.contactId === active.contactId) : null;

  // A fresh recipient became active: the hand-off state and any error belonged to the last person.
  useEffect(() => {
    setHandOff(null);
    setShareError(null);
  }, [active?.contactId]);

  if (!sendJob) {
    return null;
  }

  const total = sendJob.recipients.length;
  const done = sendJob.recipients.filter((r) => r.status === 'delivered' || r.status === 'skipped').length;
  const activeIndex = active ? sendJob.recipients.findIndex((r) => r.contactId === active.contactId) : -1;
  const isLast = activeIndex === total - 1;
  const nameFor = (id: string) => contacts.find((c) => c.contactId === id)?.name ?? copy.recipientFallback;
  const canShare = typeof navigator.share === 'function';

  function openMessages() {
    if (!active || !activeContact) {
      return;
    }
    const link = buildSmsLink(activeContact.phone, flow.composedMessage, isIOSUserAgent(navigator.userAgent));
    setHandOff('sms');
    window.location.href = link;
  }

  // For Facebook, Instagram, WhatsApp, or anything else the OS offers.
  function shareMessage() {
    if (!active) {
      return;
    }
    setShareError(null);
    if (canShare) {
      // No await before this call: navigator.share() must fire directly from the click's own gesture.
      navigator.share({ text: flow.composedMessage }).then(
        () => setHandOff('shared'),
        (err: unknown) => {
          if (err instanceof DOMException && err.name === 'AbortError') {
            return; // dismissed, not a failure
          }
          setShareError(copy.shareError);
        },
      );
      return;
    }
    navigator.clipboard
      .writeText(flow.composedMessage)
      .then(() => setHandOff('copied'))
      .catch(() => setShareError(copy.copyError));
  }

  const nextWord = isLast ? copy.done : copy.next;
  const note =
    handOff === 'sms'
      ? fill(copy.messagesNote, { action: nextWord })
      : handOff === 'shared'
        ? activeContact
          ? fill(copy.sharedNote, { name: activeContact.name })
          : copy.sharedNoteFallback
        : copy.copiedNote;

  return (
    <div className="pt-8">
      <Sending
        copy={copy}
        intro={copy.intro}
        progress={total === 0 ? 0 : done / total}
        current={
          active && activeContact
            ? {
                position: fill(copy.position, { n: activeIndex + 1, total }),
                name: activeContact.name,
                message: flow.composedMessage,
                isLast,
              }
            : undefined
        }
        others={sendJob.recipients
          .filter((r) => r.contactId !== active?.contactId)
          .map((r) => ({
            id: r.contactId,
            name: nameFor(r.contactId),
            status: r.status === 'delivered' ? 'sent' : r.status === 'skipped' ? 'skipped' : 'waiting',
          }))}
        handOff={
          handOff
            ? {
                note,
                again: handOff === 'sms' ? copy.openMessagesAgain : canShare ? copy.shareAgain : copy.copyAgain,
                onAgain: handOff === 'sms' ? openMessages : shareMessage,
              }
            : null
        }
        error={shareError ?? undefined}
        onOpenMessages={openMessages}
        share={{ label: canShare ? copy.share : copy.copyMessage, onPress: shareMessage }}
        onNext={markActiveSent}
        onSkip={markActiveSkipped}
        onWhatYoullNeed={() => setSheetOpen(true)}
        checklistRef={checklistButton}
      />
      {sheetOpen && <WhatYoullNeedSheet onClose={() => setSheetOpen(false)} returnFocusRef={checklistButton as unknown as RefObject<HTMLElement | null>} />}
    </div>
  );
}
