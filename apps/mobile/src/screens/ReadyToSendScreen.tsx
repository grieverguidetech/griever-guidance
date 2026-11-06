import { useEffect, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import { AccessibilityInfo, findNodeHandle, KeyboardAvoidingView, Platform, StyleSheet, Text as RNText } from 'react-native';
import { fill, recipientsPhrase, screenCopy, sendLabel } from '@griever/copy';
import { MOMENT_CATEGORY } from '@griever/hooks';
import type { UseContactsResult } from '@griever/hooks';
import { firstName } from '@griever/shared';
import type { MomentKey } from '@griever/shared';
import { colors } from '@griever/tokens';
import { ReadyToSend } from '../ui';
import type { ButtonNode } from '../ui';
import type { FlowProps } from '../app/App';
import { DetailsRow, isMissing } from '../components/DetailsRow';
import { shareMessage } from '../lib/shareSheet';

const copy = screenCopy('review');
const ready = screenCopy('phoneReady');
const moments = screenCopy('pathLanding').moments;
const sendingCopy = screenCopy('sending');
const announceCopy = screenCopy('announce');

/** How many names the To row spells out before it says how many more. */
const NAMES_SHOWN = 3;

interface Props extends FlowProps {
  /** Used to name the people picked and the first one's greeting. */
  contacts?: UseContactsResult;
  /** Opens the people step: the To row link, or the button when nobody is picked. */
  onChoosePeople: () => void;
}

const momentOf = (category: FlowProps['flow']['templateCategory']): MomentKey =>
  (Object.keys(MOMENT_CATEGORY) as MomentKey[]).find((key) => MOMENT_CATEGORY[key] === category) ?? 'announce';

/** One name, two names joined, or the first few and how many more. */
function namesPhrase(names: string[]): string {
  if (names.length > NAMES_SHOWN) {
    return [names.slice(0, NAMES_SHOWN).join(', '), fill(ready.andMore, { more: String(names.length - NAMES_SHOWN) })].join(' ');
  }
  if (names.length < 2) {
    return names[0] ?? '';
  }
  return [names.slice(0, -1).join(', '), ready.and, names[names.length - 1]].join(' ');
}

/** The screen is the ReadyToSend in apps/mobile/src/ui; this holds what is mobile only: the share sheet and focus. */
export function ReadyToSendScreen({ flow, contacts, onChoosePeople }: Props) {
  const { selectedTemplate, composedMessage, selectedContactIds, prevStep, startSendJob, setMessageOverride } = flow;
  const [shareFailed, setShareFailed] = useState(false);
  const shareButton = useRef<ButtonNode>(null);
  const heading = useRef<ComponentRef<typeof RNText>>(null);

  // The heading takes screen-reader focus when the screen opens.
  useEffect(() => {
    const handle = heading.current ? findNodeHandle(heading.current) : null;
    if (handle) {
      AccessibilityInfo.setAccessibilityFocus(handle);
    }
  }, []);

  if (!selectedTemplate) {
    return null;
  }

  const isAnnouncement = flow.templateCategory === 'announcement';
  const isService = flow.templateCategory === 'service';
  const recipientCount = selectedContactIds.length;
  // Service and obituary can be posted from the share sheet; it works with no one picked.
  const canShare = isService || flow.templateCategory === 'obituary';
  const picked = selectedContactIds.map((id) => contacts?.contacts.find((c) => c.contactId === id)).filter((c) => c !== undefined);
  const names = picked.map((c) => firstName(c.name) || c.name);
  const greeting = picked[0] ? firstName(picked[0].name) : '';
  const detailsFields = detailsFieldsFor(flow);
  const showDetails = detailsFields.length > 0 && flow.messageOverride === null;
  const detailsMissing = showDetails && detailsFields.some((f) => isMissing(f, flow.composedFields));

  // The shared text has no greeting, no per-person note and nothing is recorded: it is not a send.
  async function shareElsewhere() {
    setShareFailed(false);
    const result = await shareMessage(composedMessage);
    setShareFailed(result === 'failed');
    // The sheet takes the screen reader's cursor; bring it back to the button that opened it.
    const handle = shareButton.current ? findNodeHandle(shareButton.current) : null;
    if (handle) {
      AccessibilityInfo.setAccessibilityFocus(handle);
    }
  }

  function changeMessage(message: string | null) {
    setShareFailed(false);
    setMessageOverride(message);
  }

  function toggleGreeting() {
    const next = !flow.greeting;
    flow.setGreeting(next);
    if (next && greeting !== '') {
      AccessibilityInfo.announceForAccessibilityWithOptions(fill(copy.greetingPreview, { greeting: `${greeting},` }), { queue: true });
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined}>
      <ReadyToSend
        copy={copy}
        heading={moments[momentOf(flow.templateCategory)].title}
        headingRef={heading}
        kind={isAnnouncement ? 'announcement' : isService ? 'service' : 'other'}
        lead={flow.greeting && greeting !== '' ? `${greeting},` : undefined}
        message={composedMessage}
        onMessageChange={changeMessage}
        edited={flow.messageOverride !== null}
        onUseSuggested={() => changeMessage(null)}
        tone={flow.tone}
        onToneChange={flow.setTone}
        greeting={recipientCount > 0 ? { label: copy.greetingSwitch, value: flow.greeting, onChange: toggleGreeting } : undefined}
        details={
          showDetails
            ? {
                label: isService ? ready.changeService : isAnnouncement ? ready.addNote : ready.changeThanks,
                startOpen: detailsMissing,
                render: (headingRef) => <DetailsRow copy={copy} fields={detailsFields} values={flow.composedFields} onChange={flow.setField} headingRef={headingRef} />,
              }
            : undefined
        }
        to={{
          text: fill(ready.to, { names: namesPhrase(names) || recipientsPhrase(recipientCount, copy), count: String(recipientCount) }),
          changeLabel: ready.change,
          changeName: ready.changeName,
          onChange: onChoosePeople,
        }}
        hasRecipients={recipientCount > 0}
        sendLabel={sendLabel(recipientCount, copy)}
        chooseLabel={ready.choose}
        note={ready.fine}
        blockedReason={detailsMissing ? copy.detailsHint : undefined}
        onBack={prevStep}
        onSend={startSendJob}
        onChoose={onChoosePeople}
        share={
          canShare
            ? {
                label: ready.shareInstead,
                buttonRef: shareButton,
                onPress: () => void shareElsewhere(),
                error: shareFailed ? sendingCopy.shareError : undefined,
              }
            : undefined
        }
      />
    </KeyboardAvoidingView>
  );
}

/** The templates that get a Details row, and the fields the person has not already given in setup. */
function detailsFieldsFor(flow: FlowProps['flow']) {
  const template = flow.selectedTemplate;
  if (template?.id === 'announce-passing') {
    // The old intro's optional note. Name and date already come from setup, so this is all it has.
    return [
      {
        key: 'personalNote',
        label: `${announceCopy.noteLabel} ${announceCopy.optional}`,
        placeholder: ready.notePlaceholder,
        required: false,
        multiline: true,
      },
    ];
  }
  if (!template || (template.id !== 'share-service' && template.id !== 'thank-you-note')) {
    return [];
  }
  const session = flow.session;
  return template.fields.filter((field) => {
    if (field.key === 'deceasedName') {
      return !session?.personName;
    }
    if (field.key === 'senderName') {
      return !session?.senderName;
    }
    return true;
  });
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
});
