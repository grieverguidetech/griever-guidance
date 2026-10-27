import { useEffect, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import { AccessibilityInfo, findNodeHandle, Linking, Platform, ScrollView, StyleSheet, Text } from 'react-native';
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
 * The screen is the shared Sending in libs/ui; this holds what is mobile only: the sms: link and
 * screen-reader focus.
 *
 * One contact at a time, texted from the griever's own number, not a bulk send. The first button
 * hands off to the device's native Messages app (an sms: link) with the contact and message
 * pre-filled; the griever taps Send there, comes back, and taps Next. Nothing is inferred from
 * the app going to the background and coming back.
 */
export function SendingScreen({ flow, contacts }: Props) {
  const { sendJob, markActiveSent, markActiveSkipped } = flow;
  const [handedOff, setHandedOff] = useState(false);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const checklistButton = useRef<ButtonNode>(null);
  const heading = useRef<ComponentRef<typeof Text>>(null);

  const active = sendJob?.recipients.find((r) => r.status === 'sending') ?? null;
  const activeContact = active ? contacts.contacts.find((c) => c.contactId === active.contactId) : null;

  // A fresh recipient became active: the hand-off belonged to the last person.
  useEffect(() => {
    setHandedOff(false);
  }, [active?.contactId]);

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

  function openMessages() {
    if (!active || !activeContact) {
      return;
    }
    const link = buildSmsLink(activeContact.phone, flow.composedMessage, Platform.OS === 'ios');
    setHandedOff(true);
    void Linking.openURL(link);
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
          handedOff
            ? { note: fill(copy.messagesNote, { action: isLast ? copy.done : copy.next }), again: copy.openMessagesAgain, onAgain: openMessages }
            : null
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
