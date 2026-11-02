import { useEffect, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import { AccessibilityInfo, AppState, findNodeHandle, Linking, Platform, ScrollView, StyleSheet, Text } from 'react-native';
import { fill, screenCopy } from '@griever/copy';
import { buildSmsLink } from '@griever/hooks';
import type { UseContactsResult } from '@griever/hooks';
import { colors, spacing } from '@griever/tokens';
import { Sending } from '@griever/ui';
import type { ButtonNode } from '@griever/ui';
import { WhatYoullNeedSheet } from '../components/WhatYoullNeedSheet';
import type { FlowProps } from '../app/App';

const copy = screenCopy('sending');

interface Props extends FlowProps {
  contacts: UseContactsResult;
}

/**
 * The screen is the shared Sending in libs/ui; this holds what is mobile only: the sms: link,
 * screen-reader focus and the return from Messages.
 *
 * One contact at a time, texted from the griever's own number, not a bulk send. The first button
 * hands off to the device's native Messages app (an sms: link) with the contact and message
 * pre-filled; the griever taps Send there themselves. When the app goes to the background and
 * comes back active, it asks whether that person was sent (REQUIREMENTS.md section 6, Decision 3).
 * One tap marks them sent and opens Messages for the next; Not yet keeps the person; Skip stays.
 * Nothing is marked sent without a tap. If no return is detected, Next works as before.
 * The send job is not saved.
 */
export function SendingScreen({ flow, contacts }: Props) {
  const { sendJob, markActiveSent, markActiveSkipped } = flow;
  // Who the last hand-off was for, and whose "Sent?" question is showing. Ids, so a new active
  // person starts clean without a reset.
  const [handedOffId, setHandedOffId] = useState<string | null>(null);
  const [askingId, setAskingId] = useState<string | null>(null);
  const wentAway = useRef(false);
  // The contact whose question was already answered Yes, so a second tap cannot mark the next one.
  const confirmedFor = useRef<string | null>(null);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const checklistButton = useRef<ButtonNode>(null);
  const heading = useRef<ComponentRef<typeof Text>>(null);

  const active = sendJob?.recipients.find((r) => r.status === 'sending') ?? null;
  const activeContact = active ? contacts.contacts.find((c) => c.contactId === active.contactId) : null;

  const activeId = active?.contactId ?? null;
  const handedOff = activeId !== null && handedOffId === activeId;
  const asking = handedOff && askingId === activeId;

  // After a hand-off, leaving the app and coming back asks the question. No change, no question.
  useEffect(() => {
    if (!handedOff) {
      return;
    }
    wentAway.current = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Only 'background' counts. 'inactive' also fires for Control Center and the notification shade.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        wentAway.current = true;
      } else if (state === 'active' && wentAway.current) {
        wentAway.current = false;
        // A moment after the app is active, so the screen reader is ready to move focus to the question.
        timer = setTimeout(() => setAskingId(activeId), 100);
      }
    });
    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, [handedOff, activeId]);

  // The heading takes screen-reader focus when the screen opens.
  useEffect(() => {
    const handle = heading.current ? findNodeHandle(heading.current) : null;
    if (handle) {
      AccessibilityInfo.setAccessibilityFocus(handle);
    }
  }, []);

  // iOS tells us when the sheet is gone; Android returns to the last focused view by itself.
  const focusChecklistButton = () => {
    const handle = checklistButton.current ? findNodeHandle(checklistButton.current) : null;
    if (handle) {
      AccessibilityInfo.setAccessibilityFocus(handle);
    }
  };

  if (!sendJob) {
    return null;
  }

  const total = sendJob.recipients.length;
  const done = sendJob.recipients.filter((r) => r.status === 'delivered' || r.status === 'skipped').length;
  const activeIndex = active ? sendJob.recipients.findIndex((r) => r.contactId === active.contactId) : -1;
  const isLast = activeIndex === total - 1;
  const nameFor = (id: string) => contacts.contacts.find((c) => c.contactId === id)?.name ?? copy.recipientFallback;

  function handOffTo(contactId: string) {
    const contact = contacts.contacts.find((c) => c.contactId === contactId);
    if (!contact) {
      return;
    }
    const link = buildSmsLink(contact.phone, flow.messageFor(contact.name), Platform.OS === 'ios');
    setHandedOffId(contactId);
    setAskingId(null);
    // If Messages cannot open, this person goes back to the Text button rather than waiting on a hand-off that never happened.
    Linking.openURL(link).catch(() => {
      setHandedOffId((current) => (current === contactId ? null : current));
    });
  }

  function openMessages() {
    if (active) {
      handOffTo(active.contactId);
    }
  }

  // One tap: this person is sent, and Messages opens for the next, if there is one.
  function confirmSent() {
    if (!activeId || confirmedFor.current === activeId) {
      return;
    }
    confirmedFor.current = activeId;
    const next = isLast ? undefined : sendJob?.recipients[activeIndex + 1];
    markActiveSent();
    if (next) {
      handOffTo(next.contactId);
    }
  }

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Sending
        copy={copy}
        intro={copy.introTextOnly}
        progress={total === 0 ? 0 : done / total}
        current={
          active && activeContact
            ? {
                position: fill(copy.position, { n: activeIndex + 1, total }),
                name: activeContact.name,
                message: flow.messageFor(activeContact.name),
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
          handedOff
            ? { note: fill(copy.messagesNote, { action: isLast ? copy.done : copy.next }), again: copy.openMessagesAgain, onAgain: openMessages }
            : null
        }
        openLabel={activeContact ? fill(copy.textPerson, { name: activeContact.name }) : undefined}
        confirmSent={
          asking && activeContact
            ? {
                yes: isLast
                  ? fill(copy.sentPromptDone, { name: activeContact.name })
                  : fill(copy.sentPromptNext, { name: activeContact.name, next: nameFor(sendJob.recipients[activeIndex + 1].contactId) }),
                hint: isLast
                  ? fill(copy.sentHintDone, { name: activeContact.name })
                  : fill(copy.sentHintNext, { name: activeContact.name, next: nameFor(sendJob.recipients[activeIndex + 1].contactId) }),
                notYet: copy.notYet,
                onYes: confirmSent,
                onNotYet: () => setHandedOffId(null),
              }
            : undefined
        }
        onOpenMessages={openMessages}
        onNext={markActiveSent}
        onSkip={markActiveSkipped}
        headingRef={heading}
        onWhatYoullNeed={() => setChecklistOpen(true)}
        checklistRef={checklistButton}
      />
      <WhatYoullNeedSheet visible={checklistOpen} onClose={() => setChecklistOpen(false)} onDismiss={focusChecklistButton} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing[3], paddingTop: spacing[4] },
});
