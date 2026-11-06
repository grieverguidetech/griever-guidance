import { useEffect, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import { AccessibilityInfo, AppState, findNodeHandle, KeyboardAvoidingView, Linking, Platform, StyleSheet, Text } from 'react-native';
import { fill, screenCopy } from '@griever/copy';
import { buildSmsLink } from '@griever/hooks';
import type { UseContactsResult } from '@griever/hooks';
import { colors } from '@griever/tokens';
import { Sending } from '../ui';
import type { FlowProps } from '../app/App';

const copy = screenCopy('sending');
const texting = screenCopy('phoneTexting');
/** A tap this soon after a hand-off is the same tap landing on the button that took the first one's place. */
export const HAND_OFF_GUARD_MS = 1000;

const copyOptional = screenCopy('announce').optional;

interface Props extends FlowProps {
  contacts: UseContactsResult;
}

/**
 * The screen is the Sending in apps/mobile/src/ui; this holds what is mobile only: the sms: link,
 * screen-reader focus and the return from Messages.
 *
 * One contact at a time, texted from the griever's own number, not a bulk send. The first button
 * hands off to the device's native Messages app (an sms: link) with the contact and message
 * pre-filled; the griever taps Send there themselves. When the app goes to the background and
 * comes back active, it asks whether that person was sent (REQUIREMENTS.md section 6, Decision 3).
 * One tap marks them sent and opens Messages for the next; Not yet opens Messages again for the same person; Skip stays.
 * The answer is the primary button in the bottom bar; Not yet and Skip are links above it.
 * Nothing is marked sent without a tap. If no return is detected, Next works as before.
 * The send job is not saved. Each person marked sent is written to the device the moment it
 * happens (ids only, in App.tsx), so a restart never texts them twice.
 */
export function SendingScreen({ flow, contacts }: Props) {
  const { sendJob, markActiveSent, markActiveSkipped, stopSending } = flow;
  // Who the last hand-off was for, and whose "Sent?" question is showing. Ids, so a new active
  // person starts clean without a reset.
  const [handedOffId, setHandedOffId] = useState<string | null>(null);
  const [askingId, setAskingId] = useState<string | null>(null);
  // Whose hand-off failed to open Messages; shows a calm line and puts them back on the Text button.
  const [failedId, setFailedId] = useState<string | null>(null);
  const wentAway = useRef(false);
  // When Messages was last opened. A tap right after lands on the button that replaced the one tapped.
  const handedOffAt = useRef(0);
  // The contact whose question was already answered Yes, so a second tap cannot mark the next one.
  const confirmedFor = useRef<string | null>(null);
  // When a thank-you card moved on without opening Messages. A tap this soon lands on the Text button that took the Yes button's place.
  const confirmedAt = useRef(0);
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

  if (!sendJob) {
    return null;
  }

  const total = sendJob.recipients.length;
  const segments = sendJob.recipients.map((r) => (r.status === 'delivered' || r.status === 'skipped' ? 'done' : r.status === 'sending' ? 'current' : 'waiting'));
  const activeIndex = active ? sendJob.recipients.findIndex((r) => r.contactId === active.contactId) : -1;
  const isLast = activeIndex === total - 1;
  const thankYou = flow.templateCategory === 'aftercare';
  const nameFor = (id: string) => contacts.contacts.find((c) => c.contactId === id)?.name ?? copy.recipientFallback;

  function handOffTo(contactId: string) {
    const contact = contacts.contacts.find((c) => c.contactId === contactId);
    if (!contact) {
      return;
    }
    const link = buildSmsLink(contact.phone, flow.messageFor(contact.name, contactId), Platform.OS === 'ios');
    handedOffAt.current = Date.now();
    setHandedOffId(contactId);
    setAskingId(null);
    setFailedId(null);
    // If Messages cannot open, this person goes back to the Text button rather than waiting on a hand-off that never happened.
    Linking.openURL(link).catch(() => {
      setHandedOffId((current) => (current === contactId ? null : current));
      setFailedId(contactId);
    });
  }

  function justHandedOff() {
    return Date.now() - handedOffAt.current < HAND_OFF_GUARD_MS;
  }

  function markNext() {
    if (justHandedOff()) {
      return;
    }
    markActiveSent();
  }

  function openMessages() {
    if (Date.now() - confirmedAt.current < HAND_OFF_GUARD_MS) {
      return;
    }
    if (active) {
      handOffTo(active.contactId);
    }
  }

  // One tap: this person is sent, and Messages opens for the next, if there is one.
  function confirmSent() {
    if (!activeId || confirmedFor.current === activeId || justHandedOff()) {
      return;
    }
    confirmedFor.current = activeId;
    confirmedAt.current = Date.now();
    const next = isLast ? undefined : sendJob?.recipients[activeIndex + 1];
    markActiveSent();
    // The thank-you moves to the next card without opening Messages, so the note for that person can be written first.
    if (next && !thankYou) {
      handOffTo(next.contactId);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Sending
        copy={copy}
        intro={copy.introTextOnly}
        segments={segments}
        current={
          active && activeContact
            ? {
                position: fill(copy.position, { n: activeIndex + 1, total }),
                name: activeContact.name,
                message: flow.messageFor(activeContact.name, activeContact.contactId),
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
        note={
          thankYou && activeContact
            ? {
                label: fill(copy.addLine, { name: activeContact.name }),
                optional: copyOptional,
                value: flow.recipientNotes[activeContact.contactId] ?? '',
                onChange: (value) => flow.setRecipientNote(activeContact.contactId, value),
              }
            : undefined
        }
        openLabel={activeContact ? fill(copy.textPerson, { name: activeContact.name }) : undefined}
        skipLabel={activeContact ? fill(texting.skipPerson, { name: activeContact.name }) : ''}
        confirmSent={
          asking && activeContact
            ? {
                yes: isLast
                  ? fill(copy.sentPromptDone, { name: activeContact.name })
                  : fill(copy.sentPromptNext, { name: activeContact.name, next: nameFor(sendJob.recipients[activeIndex + 1].contactId) }),
                hint: isLast
                  ? fill(copy.sentHintDone, { name: activeContact.name })
                  : fill(thankYou ? copy.sentHintNextNote : copy.sentHintNext, { name: activeContact.name, next: nameFor(sendJob.recipients[activeIndex + 1].contactId) }),
                notYet: texting.notYetOpenAgain,
                onYes: confirmSent,
                onNotYet: openMessages,
              }
            : undefined
        }
        error={activeId !== null && failedId === activeId && activeContact ? fill(copy.smsError, { name: activeContact.name }) : undefined}
        focusOpenOnError
        onOpenMessages={openMessages}
        onNext={markNext}
        onSkip={markActiveSkipped}
        stop={{ label: copy.stopForNow, note: copy.stopNote, line: texting.stopAnyTime, onPress: stopSending }}
        nameRef={heading}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
});
