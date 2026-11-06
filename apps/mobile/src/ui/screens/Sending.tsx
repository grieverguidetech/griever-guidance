import { useEffect, useId, useRef } from 'react';
import type { ComponentRef, RefObject } from 'react';
import { AccessibilityInfo, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radius, spacing } from '@griever/tokens';
import { ActionBar } from '../ActionBar';
import { Button } from '../Button';
import type { ButtonNode } from '../Button';
import { Card } from '../Card';
import { focusNode } from '../focusNode';
import { Status } from '../Status';
import { Body } from '../Text';
import { useSerifStyle } from '../typography';

/** The words the screen needs. libs/copy/screens/sending.json has these keys, plus more. */
export interface SendingCopy {
  openMessages: string;
  next: string;
  done: string;
  sent: string;
  skipped: string;
  waiting: string;
}

export interface SendingPerson {
  id: string;
  name: string;
  status: 'sent' | 'skipped' | 'waiting';
}

/** One segment of the progress strip per person. */
export type SendingSegment = 'done' | 'current' | 'waiting';

export const BAR_TEST_ID = 'sending-action-bar';

/** The name is the biggest text on the screen (28 points or more). */
export const NAME_FONT_SIZE = 30;

export interface SendingProps {
  copy: SendingCopy;
  /** The line under the name. The app picks the wording for what it can do. */
  intro: string;
  /** One entry per person, in order. Drawn as a strip that screen readers skip: `current.position` says it in words. */
  segments: SendingSegment[];
  /** The person being texted now. Unset once no one is left. */
  current?: {
    /** Already built, for example "2 of 3". */
    position: string;
    name: string;
    message: string;
    isLast: boolean;
  };
  /** Everyone else, with where each stands. */
  others: SendingPerson[];
  /**
   * Set once the message was handed off to the phone's Messages. The note is read out; `again`
   * names the link that repeats the hand-off.
   */
  handOff: { note: string; again: string; onAgain: () => void } | null;
  /**
   * The app saw the person come back from Messages and asks if it was sent. `yes` is the whole
   * question as the bottom button ("Sent to Ana? Next: Ben"); one tap confirms. `notYet` is a link
   * above it.
   */
  confirmSent?: { yes: string; hint: string; notYet: string; onYes: () => void; onNotYet: () => void };
  /** Replaces the hand-off button's label, for example "Text Ana". Unset keeps `copy.openMessages`. */
  openLabel?: string;
  /** The link above the bar that skips this person, for example "Skip Ana". */
  skipLabel: string;
  /**
   * Thank-you only. An optional line for this person, added as the last line of their text.
   * Shown before the hand-off.
   */
  note?: { label: string; optional: string; value: string; onChange: (value: string) => void };
  /** Moves focus to the bottom button when `error` shows. */
  focusOpenOnError?: boolean;
  /** A calm error line, for example when Messages did not open. */
  error?: string;
  onOpenMessages: () => void;
  onNext: () => void;
  onSkip: () => void;
  /** "Stop for now" in the top bar; its note is read as the button's hint. Leave unset to hide it. */
  stop?: { label: string; note: string; line: string; onPress: () => void };
  /** The name is the page heading. The app holds the ref to move focus to it when the screen opens. */
  nameRef?: RefObject<ComponentRef<typeof Text> | null>;
}

/**
 * "Reaching people, one at a time": one name, big, with the answer in the bottom bar. The hand-off
 * to Messages is the bar's button; on return it reads the MOB-4 question. Mobile's own screen
 * (apps/mobile/src/ui). It owns no state; the app holds the hand-off and does the platform work.
 */
export function Sending({ copy, intro, segments, current, others, handOff, confirmSent, note, openLabel, skipLabel, focusOpenOnError, error, onOpenMessages, onNext, onSkip, stop, nameRef: nameRefProp }: SendingProps) {
  const statusId = useId();
  const noteLabelId = useId();
  const inputFont = useSerifStyle('regular');
  const nameFont = useSerifStyle('semibold');
  const ownNameRef = useRef<ComponentRef<typeof Text>>(null);
  const nameRef = nameRefProp ?? ownNameRef;
  // The bar's button stays the same node as its words change, so one ref serves every state.
  const barRef = useRef<ButtonNode>(null);
  const handedOff = handOff !== null;
  const personKey = current?.position;
  const lastPerson = useRef(personKey);

  // The hand-off changes the bar's words; focus stays on its button so the new words are read.
  useEffect(() => {
    if (handedOff) {
      focusNode(barRef.current);
    }
  }, [handedOff]);

  // The question takes the screen reader's focus when it shows, so it is read out. Focus is on the
  // bar button already, so iOS is also told the new words.
  const asking = confirmSent !== undefined;
  const question = confirmSent?.yes;
  // When it closes without a new person ("Not yet"), focus goes back to the bar. When a new person
  // took over (Yes or Skip), the name takes focus instead, so the bar is left alone.
  const wasAsking = useRef(false);
  // Keep this effect declared before the name effect below: it reads lastPerson.current before that effect updates it.
  useEffect(() => {
    const personChanged = personKey !== lastPerson.current;
    if (asking || (wasAsking.current && !personChanged)) {
      focusNode(barRef.current);
    }
    if (asking && question && Platform.OS === 'ios') {
      AccessibilityInfo.announceForAccessibility(question);
    }
    wasAsking.current = asking;
  }, [asking, question, personKey]);

  // A failed hand-off puts the person back on the Text button; focus goes there too.
  const failed = focusOpenOnError === true && error !== undefined;
  useEffect(() => {
    if (failed) {
      focusNode(barRef.current);
    }
  }, [failed]);

  // After Next or Skip the new person's name is read first, then the bar. The first person is
  // skipped: the app moves focus to the name when the screen opens.
  useEffect(() => {
    if (personKey !== lastPerson.current) {
      lastPerson.current = personKey;
      if (personKey !== undefined) {
        focusNode(nameRef.current);
      }
    }
  }, [personKey, nameRef]);

  const skip = <Button variant="tertiary" label={skipLabel} onPress={onSkip} />;
  const bar = !current ? null : handOff && confirmSent ? (
    <ActionBar
      testID={BAR_TEST_ID}
      label={confirmSent.yes}
      hint={confirmSent.hint}
      buttonRef={barRef}
      onPress={confirmSent.onYes}
      above={
        <>
          <Button variant="tertiary" label={confirmSent.notYet} onPress={confirmSent.onNotYet} />
          {skip}
        </>
      }
    />
  ) : handOff ? (
    <ActionBar
      testID={BAR_TEST_ID}
      label={current.isLast ? copy.done : copy.next}
      buttonRef={barRef}
      onPress={onNext}
      above={
        <>
          <Button variant="tertiary" label={handOff.again} onPress={handOff.onAgain} />
          {skip}
        </>
      }
    />
  ) : (
    <ActionBar
      testID={BAR_TEST_ID}
      label={openLabel ?? copy.openMessages}
      // On the phone the error is also the hint: focus moves here at once, and would cut the line off.
      hint={focusOpenOnError ? error : undefined}
      buttonRef={barRef}
      onPress={onOpenMessages}
      above={skip}
    />
  );

  return (
    <>
      <ScrollView style={styles.page} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.screen}>
          <View style={styles.topBar}>
            {current && stop ? <Button label={stop.label} hint={stop.note} variant="header" onPress={stop.onPress} /> : <View />}
            {current ? <Body tone="muted">{current.position}</Body> : null}
          </View>
          {current && stop ? (
            <Body tone="muted" hidden>
              {stop.line}
            </Body>
          ) : null}
          {/* Hidden from assistive tech: "N of M" in the top bar already says how far along it is. */}
          <View style={styles.track} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {segments.map((state, index) => (
              <View key={index} style={[styles.segment, state === 'done' && styles.segmentDone, state === 'current' && styles.segmentCurrent]} />
            ))}
          </View>
          {current ? (
            <View style={styles.who}>
              <Text ref={nameRef} style={[styles.name, nameFont]} role="heading" aria-level={1} accessibilityRole="header">
                {current.name}
              </Text>
              <Body tone="muted">{intro}</Body>
            </View>
          ) : null}
          {current ? (
            <Card>
              <Body>{current.message}</Body>
              {note ? (
                <View style={styles.field}>
                  <Body tone="strong" id={noteLabelId}>
                    {note.label} <Text style={styles.optional}>{note.optional}</Text>
                  </Body>
                  <TextInput
                    style={[styles.input, inputFont]}
                    // Web names the field from the visible label; native reads the label text directly.
                    aria-labelledby={noteLabelId}
                    {...webFieldHook}
                    accessibilityLabel={`${note.label} ${note.optional}`}
                    value={note.value}
                    onChangeText={note.onChange}
                  />
                </View>
              ) : null}
              <Status id={statusId} message={error ?? (confirmSent ? undefined : handOff?.note)} tone={error ? 'danger' : 'muted'} />
            </Card>
          ) : null}
          <View style={styles.list} role="list">
            {others.map((person) => (
              // One element per row, read as "Name, status".
              <View key={person.id} style={styles.person} role="listitem" accessible accessibilityLabel={`${person.name}, ${copy[person.status]}`}>
                <Body>{person.name}</Body>
                <Body tone="muted">{copy[person.status]}</Body>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
      {bar}
    </>
  );
}

const webFieldHook: Record<string, unknown> = { dataSet: { ggField: 'true' } };

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing[3], paddingTop: spacing[4] },
  screen: { gap: spacing[3] },
  topBar: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2], justifyContent: 'space-between', alignItems: 'center' },
  track: { flexDirection: 'row', gap: spacing[1] },
  segment: { flex: 1, height: 6, borderRadius: radius.sm, backgroundColor: colors['neutral-200'] },
  segmentDone: { backgroundColor: colors['accent-700'] },
  segmentCurrent: { backgroundColor: colors['accent-500'] },
  who: { gap: spacing[1] },
  name: { fontSize: NAME_FONT_SIZE, color: colors.ink },
  input: {
    minHeight: 48,
    paddingHorizontal: spacing[2],
    borderWidth: 1,
    borderColor: colors['neutral-600'],
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    color: colors.ink,
  },
  field: { gap: spacing[1] },
  optional: { color: colors['neutral-700'], fontWeight: '400' },
  list: { gap: spacing[2] },
  person: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[1], justifyContent: 'space-between', alignItems: 'center' },
});
