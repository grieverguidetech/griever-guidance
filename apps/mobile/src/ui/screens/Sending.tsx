import { useEffect, useId, useRef } from 'react';
import type { ComponentRef, Ref } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radius, spacing } from '@griever/tokens';
import { Button } from '../Button';
import type { ButtonNode } from '../Button';
import { Card } from '../Card';
import { focusNode } from '../focusNode';
import { Heading } from '../Heading';
import type { HeadingProps } from '../Heading';
import { Status } from '../Status';
import { Body, Eyebrow } from '../Text';
import { useSerifStyle } from '../typography';

/** The words the screen needs. libs/copy/screens/sending.json has these keys, plus more. */
export interface SendingCopy {
  heading: string;
  checklist: string;
  openMessages: string;
  skip: string;
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

export interface SendingProps {
  copy: SendingCopy;
  /** The line under the heading. The app picks the wording for what it can do. */
  intro: string;
  /** 0 to 1: how many people are sent or skipped. */
  progress: number;
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
   * Set once the message was handed off to the phone's Messages or the share sheet. The note is
   * read out; `again` names the button that repeats the hand-off.
   */
  handOff: { note: string; again: string; onAgain: () => void } | null;
  /**
   * Mobile only. The app saw the person come back from Messages and asks if it was sent. `yes` is
   * the whole question as one button ("Sent to Ana? Next: Ben"); one tap confirms. The web never
   * sets it, so it keeps the single Next tap.
   */
  confirmSent?: { yes: string; hint: string; notYet: string; onYes: () => void; onNotYet: () => void };
  /** Replaces the hand-off button's label, for example "Text Ana". Unset keeps `copy.openMessages`. */
  openLabel?: string;
  /**
   * Mobile thank-you only. An optional line for this person, added as the last line of their text.
   * Shown before the hand-off. The web never sets it.
   */
  note?: { label: string; optional: string; value: string; onChange: (value: string) => void };
  /** Mobile only. Moves focus to the hand-off button when `error` shows. Web leaves it unset. */
  focusOpenOnError?: boolean;
  /** A calm error line, for example when sharing did not go through. */
  error?: string;
  onOpenMessages: () => void;
  /** Leave unset when the app has no share or copy action. */
  share?: { label: string; onPress: () => void };
  onNext: () => void;
  onSkip: () => void;
  /**
   * A quiet "Stop for now" under the card, with a short muted line under it that the button also
   * reads as its hint. Leave unset to hide it.
   */
  stop?: { label: string; note: string; onPress: () => void };
  headingRef?: HeadingProps['headingRef'];
  /** Opens "What you'll need". Leave unset to hide the button. There is no Back: going back to Review could start the send again. */
  onWhatYoullNeed?: () => void;
  /** For the sheet that "What you'll need" opens to return focus to. */
  checklistRef?: Ref<ButtonNode>;
}

/**
 * "Reaching people, one at a time": one person's message at a time, handed off to Messages (or the
 * share sheet) and then Next. Built from libs/ui so web (through react-native-web) and mobile show
 * the same screen. It owns no state; the app holds the hand-off and does the platform work.
 */
export function Sending({ copy, intro, progress, current, others, handOff, confirmSent, note, openLabel, focusOpenOnError, error, onOpenMessages, share, onNext, onSkip, stop, headingRef, onWhatYoullNeed, checklistRef }: SendingProps) {
  const statusId = useId();
  const noteLabelId = useId();
  const inputFont = useSerifStyle('regular');
  const nextRef = useRef<ButtonNode>(null);
  const openRef = useRef<ButtonNode>(null);
  const yesRef = useRef<ButtonNode>(null);
  const nameRef = useRef<ComponentRef<typeof Text>>(null);
  const handedOff = handOff !== null;
  const personKey = current?.position;
  const lastPerson = useRef(personKey);

  // The hand-off swaps the buttons, so the one that was pressed is gone. Focus goes to Next.
  useEffect(() => {
    if (handedOff) {
      focusNode(nextRef.current);
    }
  }, [handedOff]);

  // The question takes the screen reader's focus when it shows, so it is read out.
  const asking = confirmSent !== undefined;
  // When it closes without a new person ("Not yet"), focus goes back to the hand-off button.
  const wasAsking = useRef(false);
  useEffect(() => {
    if (asking) {
      focusNode(yesRef.current);
    } else if (wasAsking.current) {
      focusNode(openRef.current);
    }
    wasAsking.current = asking;
  }, [asking]);

  // A failed hand-off puts the person back on the hand-off button; focus goes there too.
  const failed = focusOpenOnError === true && error !== undefined;
  useEffect(() => {
    if (failed) {
      focusNode(openRef.current);
    }
  }, [failed]);

  // After Next or Skip the pressed button is gone, so focus goes to the new person's first action.
  // With a line to write for them (the thank-you), it goes to their name instead, so the field is
  // heard before the Text button. The first person is skipped: the heading has the focus on arrival.
  const hasNote = note !== undefined;
  useEffect(() => {
    if (personKey !== lastPerson.current) {
      lastPerson.current = personKey;
      if (personKey !== undefined) {
        focusNode((hasNote ? nameRef.current : openRef.current) as ButtonNode | null);
      }
    }
  }, [personKey, hasNote]);

  return (
    <View style={styles.screen}>
      {onWhatYoullNeed ? (
        <View style={styles.topBar}>
          <Button label={copy.checklist} variant="header" opensDialog onPress={onWhatYoullNeed} buttonRef={checklistRef} />
        </View>
      ) : null}
      <View style={styles.head}>
        <Heading level={1} headingRef={headingRef}>
          {copy.heading}
        </Heading>
        <Body tone="muted">{intro}</Body>
      </View>
      {/* Hidden from assistive tech: "N of M" above the name already says how far along it is. */}
      <View style={styles.track} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={[styles.fill, { width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%` }]} />
      </View>
      {current ? (
        <Card>
          <View style={styles.who}>
            <Eyebrow>{current.position}</Eyebrow>
            <Heading level={2} headingRef={nameRef}>{current.name}</Heading>
          </View>
          <Body>{current.message}</Body>
          {note && !handOff ? (
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
          {handOff && confirmSent ? (
            <View style={styles.actions}>
              <Button label={confirmSent.yes} hint={confirmSent.hint} buttonRef={yesRef} onPress={confirmSent.onYes} />
              <Button label={confirmSent.notYet} variant="secondary" onPress={confirmSent.onNotYet} />
              <Button label={copy.skip} variant="ghost" onPress={onSkip} />
            </View>
          ) : handOff ? (
            <View style={styles.actions}>
              {/* No hint: the note below is a live region and says the same, so it is read once. */}
              <Button label={current.isLast ? copy.done : copy.next} buttonRef={nextRef} onPress={onNext} />
              <Button label={handOff.again} variant="ghost" onPress={handOff.onAgain} />
            </View>
          ) : (
            <View style={styles.actions}>
              {/* On the phone the error is also the hint: focus moves here at once, and would cut the line off. */}
              <Button label={openLabel ?? copy.openMessages} hint={focusOpenOnError ? error : undefined} buttonRef={openRef} onPress={onOpenMessages} />
              {share ? <Button label={share.label} variant="secondary" onPress={share.onPress} /> : null}
              <Button label={copy.skip} variant="ghost" onPress={onSkip} />
            </View>
          )}
          <Status id={statusId} message={error ?? (confirmSent ? undefined : handOff?.note)} tone={error ? 'danger' : 'muted'} />
        </Card>
      ) : null}
      {current && stop ? (
        <View style={styles.stop}>
          <Button label={stop.label} hint={stop.note} variant="ghost" onPress={stop.onPress} />
          {/* The button reads the same words as its hint, so the line is not read twice. */}
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Body tone="muted">{stop.note}</Body>
          </View>
        </View>
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
  );
}

const webFieldHook: Record<string, unknown> = { dataSet: { ggField: 'true' } };

const styles = StyleSheet.create({
  screen: { gap: spacing[3] },
  topBar: { flexDirection: 'row', justifyContent: 'flex-end' },
  head: { gap: spacing[1] },
  track: { height: 6, borderRadius: radius.sm, backgroundColor: colors['neutral-200'], overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors['accent-700'] },
  who: { gap: spacing[1] },
  actions: { gap: spacing[1] },
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
  stop: { gap: spacing[1] },
  list: { gap: spacing[2] },
  person: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
