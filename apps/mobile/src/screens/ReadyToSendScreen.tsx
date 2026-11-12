import { useEffect, useRef, useState } from 'react';
import type { ComponentProps, ComponentRef } from 'react';
import { AccessibilityInfo, findNodeHandle, KeyboardAvoidingView, Platform, StyleSheet, Text as RNText } from 'react-native';
import { fill, screenCopy, sendLabel } from '@griever/copy';
import { MOMENT_CATEGORY } from '@griever/hooks';
import type { UseContactsResult } from '@griever/hooks';
import { firstName } from '@griever/shared';
import type { MomentKey } from '@griever/shared';
import { colors } from '@griever/tokens';
import { ReadyToSend } from '../ui';
import type { ButtonNode } from '../ui';
import type { FlowProps } from '../app/App';
import { DetailsRow, isMissing } from '../components/DetailsRow';
import { hasWebContent } from '../lib/hasWebContent';
import { shareMessage } from '../lib/shareSheet';

const copy = screenCopy('review');
const ready = screenCopy('phoneReady');
const moments = screenCopy('pathLanding').moments;
const sendingCopy = screenCopy('sending');
const announceCopy = screenCopy('announce');
const nudgeCopy = screenCopy('phoneNudge');
const NUDGE_KEYS = { announcement: 'announcement', service: 'service', aftercare: 'thanks', obituary: 'obituary' } as const;

interface Props extends FlowProps {
  /** Used to name the people picked and the first one's greeting. */
  contacts?: UseContactsResult;
  /** Opens the people step: the change-people button, or the button when nobody is picked. */
  onChoosePeople: () => void;
  /** "Got it" on the nudge. Set by the app to go straight to the hub; unset it does what Back does. */
  onGotIt?: () => void;
  /** Set to a function that focuses the button that opens the people sheet; the sheet's onDismiss (iOS) calls it. */
  focusPeopleButton?: { current: (() => void) | null };
}

const momentOf = (category: FlowProps['flow']['templateCategory']): MomentKey =>
  (Object.keys(MOMENT_CATEGORY) as MomentKey[]).find((key) => MOMENT_CATEGORY[key] === category) ?? 'announce';

/** The screen is the ReadyToSend in apps/mobile/src/ui; this holds what is mobile only: the share sheet and focus. */
export function ReadyToSendScreen({ flow, contacts, onChoosePeople, onGotIt, focusPeopleButton }: Props) {
  const { selectedTemplate, composedMessage, selectedContactIds, prevStep, startSendJob, setMessageOverride } = flow;
  const [shareFailed, setShareFailed] = useState(false);
  // Set when the person types in a Share the service field, for this person and template. It keeps the field on screen
  // after the last missing detail is typed, so the field (and the keyboard) do not vanish mid-typing.
  const [editedServiceKey, setEditedServiceKey] = useState<string | null>(null);
  const shareButton = useRef<ButtonNode>(null);
  const heading = useRef<ComponentRef<typeof RNText>>(null);
  const peopleButton = useRef<ButtonNode>(null);
  // Set when the person opens the people sheet, so focus goes back to the button they pressed.
  const openedSheet = useRef(false);

  // The heading takes screen-reader focus when the screen opens.
  useEffect(() => {
    const handle = heading.current ? findNodeHandle(heading.current) : null;
    if (handle) {
      AccessibilityInfo.setAccessibilityFocus(handle);
    }
  }, []);

  // The people sheet is open while the step is 'contacts'. When it is gone, focus returns to the button that opened it.
  // iOS: from the sheet's onDismiss (focus set earlier is lost to the closing animation). Elsewhere: when the step changes.
  const focusPeople = () => {
    if (!openedSheet.current) {
      return;
    }
    openedSheet.current = false;
    const handle = peopleButton.current ? findNodeHandle(peopleButton.current) : null;
    if (handle) {
      AccessibilityInfo.setAccessibilityFocus(handle);
    }
  };
  if (focusPeopleButton) {
    focusPeopleButton.current = focusPeople;
  }
  // A late iOS onDismiss must not call a closure from a screen that is gone.
  useEffect(
    () => () => {
      if (focusPeopleButton) {
        focusPeopleButton.current = null;
      }
    },
    [focusPeopleButton],
  );
  const sheetOpen = flow.step === 'contacts';
  useEffect(() => {
    if (!sheetOpen && Platform.OS !== 'ios') {
      focusPeople();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetOpen]);

  if (!selectedTemplate) {
    return null;
  }

  const isAnnouncement = flow.templateCategory === 'announcement';
  const isService = flow.templateCategory === 'service';
  const recipientCount = selectedContactIds.length;
  // Service and obituary can be posted from the share sheet; it works with no one picked.
  const canShare = isService || flow.templateCategory === 'obituary';
  const picked = selectedContactIds.map((id) => contacts?.contacts.find((c) => c.contactId === id)).filter((c) => c !== undefined);
  const greeting = picked[0] ? firstName(picked[0].name) : '';
  const detailsFields = detailsFieldsFor(flow);
  const showDetails = detailsFields.length > 0 && flow.messageOverride === null;
  const detailsMissing = showDetails && detailsFields.some((f) => isMissing(f, flow.composedFields));
  const serviceKey = `${flow.session?.personName ?? ''}:${selectedTemplate.id}`;

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

  function choosePeople() {
    openedSheet.current = true;
    onChoosePeople();
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

  // Nothing started on the web for this step: a nudge replaces the message and the send controls (#824).
  // A draft already in progress (edited words, or a send under way) keeps the normal screen, so it is never stranded.
  const showNudge =
    flow.templateCategory !== null &&
    flow.session !== null &&
    flow.session !== undefined &&
    !hasWebContent(flow.session, flow.templateCategory) &&
    !flow.messageOverride?.trim() &&
    !flow.sendJob;
  let nudge: ComponentProps<typeof ReadyToSend>['nudge'];
  if (showNudge && flow.templateCategory) {
    const key = NUDGE_KEYS[flow.templateCategory];
    nudge = { title: nudgeCopy[`${key}Title`], line: nudgeCopy[`${key}Line`], button: nudgeCopy.gotIt, onGotIt: onGotIt ?? prevStep };
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined}>
      <ReadyToSend
        nudge={nudge}
        copy={{ ...copy, messageCaption: ready.messageCaption }}
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
          // Share the service has no toggle: its fields show only while a required detail is missing.
          showDetails && (!isService || detailsMissing || editedServiceKey === serviceKey)
            ? {
                label: isService ? undefined : isAnnouncement ? ready.addNote : ready.changeThanks,
                startOpen: detailsMissing,
                render: (headingRef) => <DetailsRow copy={copy} fields={detailsFields} values={flow.composedFields} onChange={(key, value) => {
                  if (isService) {
                    setEditedServiceKey(serviceKey);
                  }
                  flow.setField(key, value);
                }} headingRef={headingRef} />,
              }
            : undefined
        }
        changePeople={{ label: ready.changeName, onPress: choosePeople }}
        hasRecipients={recipientCount > 0}
        sendLabel={sendLabel(recipientCount, copy)}
        chooseLabel={ready.choose}
        note={ready.fine}
        blockedReason={detailsMissing ? copy.detailsHint : undefined}
        onBack={prevStep}
        onSend={startSendJob}
        onChoose={choosePeople}
        peopleButtonRef={peopleButton}
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
