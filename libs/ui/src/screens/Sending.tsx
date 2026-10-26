import { useEffect, useId, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, radius, spacing } from '@griever/tokens';
import { Button } from '../Button';
import type { ButtonNode } from '../Button';
import { Card } from '../Card';
import { focusNode } from '../focusNode';
import { Heading } from '../Heading';
import type { HeadingProps } from '../Heading';
import { Status } from '../Status';
import { Body, Eyebrow } from '../Text';

/** The words the screen needs. libs/copy/screens/sending.json has these keys, plus more. */
export interface SendingCopy {
  heading: string;
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
  /** A calm error line, for example when sharing did not go through. */
  error?: string;
  onOpenMessages: () => void;
  /** Leave unset when the app has no share or copy action. */
  onShare?: () => void;
  shareLabel?: string;
  onNext: () => void;
  onSkip: () => void;
  headingRef?: HeadingProps['headingRef'];
}

/**
 * "Reaching people, one at a time": one person's message at a time, handed off to Messages (or the
 * share sheet) and then Next. Built from libs/ui so web (through react-native-web) and mobile show
 * the same screen. It owns no state; the app holds the hand-off and does the platform work.
 */
export function Sending({ copy, intro, progress, current, others, handOff, error, onOpenMessages, onShare, shareLabel, onNext, onSkip, headingRef }: SendingProps) {
  const statusId = useId();
  const nextRef = useRef<ButtonNode>(null);
  const handedOff = handOff !== null;

  // The hand-off swaps the buttons, so the one that was pressed is gone. Focus goes to Next.
  useEffect(() => {
    if (handedOff) {
      focusNode(nextRef.current);
    }
  }, [handedOff]);

  return (
    <View style={styles.screen}>
      <View style={styles.head}>
        <Heading level={1} headingRef={headingRef}>
          {copy.heading}
        </Heading>
        <Body tone="muted">{intro}</Body>
      </View>
      <View style={styles.track} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={[styles.fill, { width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%` }]} />
      </View>
      {current ? (
        <Card>
          <View style={styles.who}>
            <Eyebrow>{current.position}</Eyebrow>
            <Heading level={2}>{current.name}</Heading>
          </View>
          <Body>{current.message}</Body>
          {handOff ? (
            <View style={styles.actions}>
              <Button label={current.isLast ? copy.done : copy.next} buttonRef={nextRef} onPress={onNext} />
              <Button label={handOff.again} variant="ghost" onPress={handOff.onAgain} />
            </View>
          ) : (
            <View style={styles.actions}>
              <Button label={copy.openMessages} onPress={onOpenMessages} />
              {onShare ? <Button label={shareLabel ?? ''} variant="secondary" onPress={onShare} /> : null}
              <Button label={copy.skip} variant="ghost" onPress={onSkip} />
            </View>
          )}
          <Status id={statusId} message={error ?? handOff?.note} tone={error ? 'danger' : 'muted'} />
        </Card>
      ) : null}
      <View style={styles.list}>
        {others.map((person) => (
          <View key={person.id} style={styles.person}>
            <Body>{person.name}</Body>
            <Body tone="muted">{copy[person.status]}</Body>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { gap: spacing[3] },
  head: { gap: spacing[1] },
  track: { height: 6, borderRadius: radius.sm, backgroundColor: colors['neutral-200'], overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors['accent-700'] },
  who: { gap: spacing[1] },
  actions: { gap: spacing[1] },
  list: { gap: spacing[2] },
  person: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
