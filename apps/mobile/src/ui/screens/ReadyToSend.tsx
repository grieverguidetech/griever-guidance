import { useEffect, useId, useRef, useState } from 'react';
import type { ComponentRef, ReactElement, ReactNode, Ref } from 'react';
import { AccessibilityInfo, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import type { RefreshControlProps, Text as RNText } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing } from '@griever/tokens';
import { ActionBar } from '../ActionBar';
import { Button } from '../Button';
import type { ButtonNode } from '../Button';
import { Card } from '../Card';
import { WebNudge } from '../WebNudge';
import type { WebNudgeProps } from '../WebNudge';
import { focusNode } from '../focusNode';
import { Heading } from '../Heading';
import type { HeadingProps } from '../Heading';
import { MessageBox } from '../MessageBox';
import { Body } from '../Text';
import { Status } from '../Status';

/** The words the screen needs. The keys come from libs/copy/screens/review.json (read by web too) and phoneReady.json. */
export interface ReadyToSendCopy {
  back: string;
  messageLabel: string;
  /** The small line under the message box (phoneReady.json). */
  messageCaption: string;
  /** The Edit and Done toggle on the message box (phoneReady.json): the words, and the names a screen reader says. */
  messageEdit: string;
  messageEditName: string;
  messageDone: string;
  messageDoneName: string;
  softer: string;
  /** Why the tone button is unavailable once the words are edited. */
  toneKept: string;
  useSuggested: string;
  /** Restores the words that "Use the suggested wording" just dropped. */
  bringBack: string;
  /** Said politely after "Use the suggested wording". */
  suggestedInPlace: string;
  /** Said politely after "Bring back my words". */
  wordsBack: string;
  /** Why the primary is unavailable when the message is empty. */
  blank: string;
  /** Why Share elsewhere is unavailable when the message is empty. */
  shareBlank: string;
}

export interface ReadyToSendProps {
  /** Pull to refresh: the ScrollView's control and the failure line. Both absent when sync is not allowed. */
  refreshControl?: ReactElement<RefreshControlProps>;
  refreshNotice?: ReactNode;
  /** Nothing is written on the web for this step: the nudge replaces the message and the send controls. Back and the heading stay. */
  nudge?: WebNudgeProps;
  copy: ReadyToSendCopy;
  /** The moment's name. */
  heading: string;
  headingRef?: HeadingProps['headingRef'];
  /** `announcement` has the tone switch under the message box. */
  kind: 'announcement' | 'service' | 'other';
  /** The first-name line, for example "Dee,". Shown above the message when the greeting is on. */
  lead?: string;
  message: string;
  onMessageChange: (message: string) => void;
  /** The person's own words are in use (the app holds an override). */
  edited: boolean;
  /** Drops the edit and returns to the suggested wording. */
  onUseSuggested: () => void;
  /** `softer` or `plain`. */
  tone: string;
  onToneChange: (tone: 'softer' | 'plain') => void;
  /** The first-name switch, under the message box. Leave unset when no one is picked. */
  greeting?: { label: string; value: boolean; onChange: () => void };
  /** The Details link and the row it opens in place. Leave unset to hide both (hand-edited text). */
  details?: { /** Leave unset for no toggle: the row is always open. */ label?: string; startOpen: boolean; /** Draws the row. `headingRef` goes on its heading, where focus lands when the row opens. */ render: (headingRef: Ref<ComponentRef<typeof RNText>>) => ReactNode };
  /** Gets the button that opens the people step (Change, or the primary when nobody is picked) back its focus when the sheet closes. */
  peopleButtonRef?: Ref<ButtonNode>;
  /** The To row: its words, built by the app, and the link that opens the people step. */
  /** The quiet button above the action bar, shown only when people are picked. */
  changePeople: { label: string; onPress: () => void };
  /** With no one picked the primary is `chooseLabel` and opens the people step. */
  hasRecipients: boolean;
  sendLabel: string;
  chooseLabel: string;
  /** The line under the primary, for example "One at a time, from your own number." */
  note: string;
  /** Why the primary is unavailable for a reason the app knows (for example a required detail is empty). A blank message comes first. */
  blockedReason?: string;
  onBack: () => void;
  onSend: () => void;
  onChoose: () => void;
  /** Service and obituary only. Leave unset for the others. */
  share?: {
    label: string;
    onPress: () => void;
    /** For returning focus to the button once the share sheet has closed. */
    buttonRef?: Ref<ButtonNode>;
    /** A calm line when the share sheet did not open. */
    error?: string;
  };
}

export const BAR_TEST_ID = 'ready-action-bar';
export const TOGETHER_TEST_ID = 'ready-share-change';

/**
 * "Ready to send": the message as it will go, edits as links under it, who it goes to, and one
 * button. Mobile's own screen (apps/mobile/src/ui). The message and tone live in the app; only
 * what is open lives here.
 */
export function ReadyToSend({ copy, heading, headingRef, kind, lead, message, onMessageChange, edited, onUseSuggested, tone, onToneChange, greeting, details, changePeople, hasRecipients, sendLabel, chooseLabel, note, blockedReason, onBack, onSend, onChoose, share, peopleButtonRef, nudge, refreshControl, refreshNotice }: ReadyToSendProps) {
  const [detailsOpen, setDetailsOpen] = useState(details?.startOpen ?? false);
  const detailsShown = details !== undefined && (details.label === undefined || detailsOpen);
  const [focusDetails, setFocusDetails] = useState(false);
  const detailsRef = useRef<ComponentRef<typeof RNText>>(null);
  const toneReasonId = useId();
  const insets = useSafeAreaInsets();
  // The bar rides above the keyboard and distracts while writing, so it waits until Done.
  const [messageEditing, setMessageEditing] = useState(false);
  // The words dropped by "Use the suggested wording", kept until the next edit.
  const [dropped, setDropped] = useState<string | null>(null);
  // The swap removes the button that was pressed, so focus moves on to its replacement once it is drawn.
  const [focusNext, setFocusNext] = useState<'bringBack' | 'useSuggested' | null>(null);
  const [swapNote, setSwapNote] = useState<string | undefined>(undefined);
  const useSuggestedRef = useRef<ButtonNode>(null);
  const bringBackRef = useRef<ButtonNode>(null);
  const swapNoteId = useId();
  const blank = message.trim() === '';
  const shareReasonId = useId();
  const shareErrorId = useId();
  const shareReason = blank ? copy.shareBlank : blockedReason;
  const reason = hasRecipients ? (blank ? copy.blank : blockedReason) : undefined;

  // The status line below is redrawn when the bar comes back, and a redrawn line is not read out, so say the reason once.
  const wasEditing = useRef(false);
  useEffect(() => {
    if (wasEditing.current && !messageEditing && reason) {
      AccessibilityInfo.announceForAccessibility(reason);
    }
    wasEditing.current = messageEditing;
    // Only when editing changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageEditing]);

  // Opening Change details moves the screen reader to the row, so the new inputs are found.
  useEffect(() => {
    if (focusDetails) {
      focusNode(detailsRef.current);
      setFocusDetails(false);
    }
  }, [focusDetails]);

  useEffect(() => {
    if (focusNext === 'bringBack') {
      focusNode(bringBackRef.current);
    } else if (focusNext === 'useSuggested') {
      focusNode(useSuggestedRef.current);
    }
    if (focusNext) {
      setFocusNext(null);
    }
  }, [focusNext]);

  const changeMessage = (next: string) => {
    setDropped(null);
    setSwapNote(undefined);
    onMessageChange(next);
  };

  const useSuggestedWording = () => {
    setDropped(message);
    onUseSuggested();
    setSwapNote(copy.suggestedInPlace);
    setFocusNext('bringBack');
  };

  const bringBackWords = () => {
    if (dropped !== null) {
      onMessageChange(dropped);
      setDropped(null);
      setSwapNote(copy.wordsBack);
      setFocusNext('useSuggested');
    }
  };

  const changePeopleRow = hasRecipients ? (
    <View style={styles.to}>
      <Button label={changePeople.label} variant="tertiary" buttonRef={peopleButtonRef} onPress={changePeople.onPress} />
    </View>
  ) : null;
  const shareRow = share ? (
    <View style={styles.share}>
      <Button
        label={share.label}
        variant="tertiary"
        buttonRef={share.buttonRef}
        ariaDisabled={shareReason !== undefined}
        announceDisabled
        describedBy={shareReason ? shareReasonId : undefined}
        hint={shareReason}
        onPress={() => {
          if (!shareReason) {
            share.onPress();
          }
        }}
      />
      <Status id={shareReasonId} message={shareReason} />
      {/* Always drawn: a status line is only read out when its text changes after it is on screen. */}
      <Status id={shareErrorId} message={share.error} tone="danger" />
    </View>
  ) : null;

  if (nudge) {
    return (
      <View style={styles.screen}>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content} refreshControl={refreshControl}>
          {refreshNotice}
          <View style={styles.topBar}>
            <Button label={copy.back} variant="header" onPress={onBack} />
          </View>
          <Heading level={1} headingRef={headingRef}>
            {heading}
          </Heading>
          <WebNudge {...nudge} />
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, messageEditing && { paddingBottom: spacing[3] + insets.bottom }]} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" refreshControl={refreshControl}>
        {refreshNotice}
        <View style={styles.topBar}>
          <Button label={copy.back} variant="header" onPress={onBack} />
        </View>
        <Heading level={1} headingRef={headingRef}>
          {heading}
        </Heading>
        <Card>
          <MessageBox
            label={copy.messageLabel}
            caption={copy.messageCaption}
            value={message}
            onChangeText={changeMessage}
            boxStyle={styles.messageBox}
            onEditingChange={setMessageEditing}
            toggle={{ edit: copy.messageEdit, editName: copy.messageEditName, done: copy.messageDone, doneName: copy.messageDoneName }}
          >
            {lead ? <Body tone="strong">{lead}</Body> : null}
          </MessageBox>
        </Card>
        <View style={styles.actions}>
          {kind === 'announcement' ? (
            <>
              <Button
                label={copy.softer}
                variant="ghost"
                pressed={tone === 'softer'}
                ariaDisabled={edited}
                announceDisabled
                describedBy={edited ? toneReasonId : undefined}
                hint={edited ? copy.toneKept : undefined}
                onPress={() => {
                  if (!edited) {
                    onToneChange(tone === 'softer' ? 'plain' : 'softer');
                  }
                }}
              />
              <Status id={toneReasonId} message={edited ? copy.toneKept : undefined} />
            </>
          ) : null}
          {greeting ? (
            <Pressable
              style={styles.greetingRow}
              onPress={greeting.onChange}
              accessibilityRole="switch"
              accessibilityLabel={greeting.label}
              accessibilityState={{ checked: greeting.value }}
            >
              <Body hidden>{greeting.label}</Body>
              <Switch value={greeting.value} onValueChange={greeting.onChange} trackColor={{ true: colors['accent-700'] }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden />
            </Pressable>
          ) : null}
          {edited ? <Button label={copy.useSuggested} variant="ghost" buttonRef={useSuggestedRef} onPress={useSuggestedWording} /> : null}
          {!edited && dropped !== null ? <Button label={copy.bringBack} variant="ghost" buttonRef={bringBackRef} onPress={bringBackWords} /> : null}
          <Status id={swapNoteId} message={swapNote} />
        </View>
        {details?.label !== undefined ? (
          <View style={styles.links}>
            <Button
              label={details.label}
              variant="tertiary"
              expanded={detailsOpen}
              onPress={() => {
                setDetailsOpen(!detailsOpen);
                setFocusDetails(!detailsOpen);
              }}
            />
          </View>
        ) : null}
        {detailsShown ? details?.render(detailsRef) : null}
        {shareRow || changePeopleRow ? (
          <View testID={TOGETHER_TEST_ID} style={styles.together}>
            {shareRow}
            {changePeopleRow}
          </View>
        ) : null}
      </ScrollView>
      {messageEditing ? null : (
        <ActionBar
          testID={BAR_TEST_ID}
          label={hasRecipients ? sendLabel : chooseLabel}
          onPress={hasRecipients ? onSend : onChoose}
          note={hasRecipients ? note : undefined}
          buttonRef={hasRecipients ? undefined : peopleButtonRef}
          disabledReason={reason}
          liveReason
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { flex: 1 },
  content: { padding: spacing[3], paddingTop: spacing[4], gap: spacing[3] },
  topBar: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[1], justifyContent: 'space-between', alignItems: 'center' },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  actions: { gap: spacing[1] },
  greetingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  together: { alignSelf: 'flex-start', alignItems: 'flex-start', gap: spacing[1] },
  to: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[1], alignItems: 'center' },
  share: { alignItems: 'flex-start' },
  messageBox: { minHeight: 132, fontSize: 15 },
});
