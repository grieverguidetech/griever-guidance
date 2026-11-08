import { useId, useRef } from 'react';
import type { ReactNode, Ref } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, minTouchTarget, radius, spacing } from '@griever/tokens';
import { Button } from '../Button';
import { Icon } from '../Icon';
import type { ButtonNode } from '../Button';
import { Phrasing } from '../phrasing';
import { Heading } from '../Heading';
import { Row } from '../Row';
import { Body, Eyebrow } from '../Text';
import { useSerifStyle } from '../typography';
import type { HeadingProps } from '../Heading';

export type HubMomentKey = 'announce' | 'service' | 'obituary' | 'thanks';

/** The words the hub needs. libs/copy/screens/pathLanding.json has these keys, plus more. */
export interface HubCopy {
  heading: string;
  intro: string;
  /** The top-bar button that opens the checklist sheet. */
  whatYoullNeed: string;
  /** Native hint read after the button's name. */
  whatYoullNeedHint: string;
  start: string;
  /** The accent line on the next card. */
  continue: string;
  /** The state words: shown on each card and last in its accessible name. */
  stateDone: string;
  stateInProgress: string;
  stateNotStarted: string;
  lockedReason: string;
  notInAppYet: string;
  moments: Record<HubMomentKey, { title: string; body: string; doneLabel: string }>;
}

export type HubRowState = 'done' | 'inProgress' | 'notStarted';

export interface HubRow {
  key: HubMomentKey;
  /** done: finished. next: the one step to do now. later: a step after that. */
  status: 'done' | 'next' | 'later';
  /** Shown as a word at the top right (a check before it only for done), and last in the row's name. */
  state: HubRowState;
  /** The muted second line, like web's Overview summary. The host builds it from the session. */
  summary?: string;
  /** The one card to do now. Exactly one row has this. It gets the accent bar and the Continue line. */
  lit?: boolean;
  /** In the full plan: stays focusable and opens the paywall placeholder. */
  locked: boolean;
  /** This host cannot do this step yet: shown with a calm reason, and not pressable. */
  unavailable?: boolean;
  /**
   * The one line under a step that names what is missing, for example "Needs the service date".
   * Shown on any row in place of the summary, and part of the row's accessible name. Status itself is the state word.
   */
  meta?: string;
}

export interface HubProps {
  copy: HubCopy;
  /** The eyebrow line, for example "For Margaret". */
  eyebrow: string;
  rows: HubRow[];
  /** The open person's name, top-left of the bar. The host draws it (plain text, or a button that opens the switcher). */
  name: ReactNode;
  /** Opens the What you'll need sheet. The host draws the sheet. */
  onWhatYoullNeed: () => void;
  onStart: (key: HubMomentKey) => void;
  /** `opener` is the row's node (DOM node on web, host instance on native), so focus can go back to it. */
  onLocked: (opener: unknown) => void;
  /** Between the heading and the steps, for example the note after a send. */
  children?: ReactNode;
  /** After the steps. */
  footer?: ReactNode;
  /** Show `meta` on locked rows too. Web leaves this off and keeps its locked rows plain. */
  metaOnAllRows?: boolean;
  headingRef?: HeadingProps['headingRef'];
  /** The What you'll need button, so the host can return screen-reader focus to it when the sheet closes. */
  whatYoullNeedRef?: Ref<ButtonNode>;
}

/**
 * The hub, "One thing at a time.": the steps of the plan for one person. Mobile's own
 * screen (apps/mobile/src/ui). It owns no state; the host passes
 * the data and answers the callbacks.
 */
export function Hub(props: HubProps) {
  const { copy } = props;
  return (
    <View style={styles.screen}>
      <View style={styles.topBar}>
        {props.name}
        <Button label={copy.whatYoullNeed} hint={copy.whatYoullNeedHint} variant="tertiary" opensDialog onPress={props.onWhatYoullNeed} buttonRef={props.whatYoullNeedRef} />
      </View>
      <View style={styles.head}>
        <Eyebrow>{props.eyebrow}</Eyebrow>
        <Heading level={1} headingRef={props.headingRef}>
          {copy.heading}
        </Heading>
        <Body tone="muted">{copy.intro}</Body>
      </View>
      {props.children}
      <View style={styles.rows}>
        {props.rows.map((row) => (
          <HubStep key={row.key} row={row} {...props} />
        ))}
      </View>
      {props.footer}
    </View>
  );
}

function HubStep({ row, copy, onStart, onLocked, metaOnAllRows }: HubProps & { row: HubRow }) {
  const text = copy.moments[row.key];

  if (row.unavailable) {
    // Text only, not a button: nothing to press, so nothing that sends (see the host's reason).
    return (
      // `accessible` groups the lines into one screen-reader stop on native. On web it would make a
      // focusable div with no action, so web gets plain text.
      <View accessible={Platform.OS !== 'web'} style={styles.plain}>
        <Body tone="muted">{text.title}</Body>
        <Body>{text.body}</Body>
        <Body tone="muted" small>
          {copy.notInAppYet}
        </Body>
      </View>
    );
  }

  if (row.locked) {
    return <LockedStep title={text.title} body={text.body} meta={metaOnAllRows ? row.meta : undefined} reason={copy.lockedReason} onLocked={onLocked} />;
  }

  return <SendCard row={row} title={text.title} stateWord={stateWords(copy)[row.state]} continueWord={copy.continue} onPress={() => onStart(row.key)} />;
}

const stateWords = (copy: HubCopy): Record<HubRowState, string> => ({
  done: copy.stateDone,
  inProgress: copy.stateInProgress,
  notStarted: copy.stateNotStarted,
});

/** A filled panel card like web's Overview card: title and state word, then one muted line. */
function SendCard(props: { row: HubRow; title: string; stateWord: string; continueWord: string; onPress: () => void }) {
  const { row } = props;
  const semibold = useSerifStyle('semibold');
  // The "Needs ..." line replaces the summary. The check is decorative, so it is not in the name.
  const line = row.meta ?? row.summary;
  // The visible words in reading order. Continue is last, and only on the next card.
  const label = [props.title, line, props.stateWord, row.lit ? props.continueWord : undefined].filter(Boolean).join(', ');
  return (
    <Pressable
      role="button"
      testID={row.lit ? 'hub-next-card' : undefined}
      accessibilityLabel={label}
      onPress={props.onPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      {row.lit ? <View testID="next-bar" style={styles.nextBar} /> : null}
      <Phrasing>
        <View style={styles.top}>
          <Text style={[styles.title, semibold]}>{props.title}</Text>
          <View style={styles.state}>
            {row.state === 'done' ? <Icon name="check" size={16} testID="status-check" color={colors['success-700']} /> : null}
            <Body small>{props.stateWord}</Body>
          </View>
        </View>
        {line ? (
          <Body tone="muted" small>
            {line}
          </Body>
        ) : null}
        {row.lit ? <Text style={[styles.continue, semibold]}>{props.continueWord}</Text> : null}
      </Phrasing>
    </Pressable>
  );
}

function Meta({ meta }: { meta?: string }) {
  if (!meta) {
    return null;
  }
  return (
    <Body tone="muted" small>
      {meta}
    </Body>
  );
}

/** `base` with `amount` of `over` mixed in, as a hex colour. */
function mixHex(base: string, over: string, amount: number): string {
  const channel = (hex: string, at: number) => parseInt(hex.slice(at, at + 2), 16);
  return `#${[1, 3, 5].map((at) => Math.round(channel(base, at) * (1 - amount) + channel(over, at) * amount).toString(16).padStart(2, '0')).join('')}`;
}

/** The card colour while pressed: surface with 7% ink over it (web's hover). Muted text keeps 4.5:1 on it (hub.spec checks). */
const PRESSED_SURFACE = mixHex(colors.surface, colors.ink, 0.07);

const styles = StyleSheet.create({
  screen: { gap: spacing[3] },
  topBar: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[1], justifyContent: 'space-between', alignItems: 'center' },
  head: { gap: spacing[1] },
  rows: { gap: spacing[2] },
  // Web's gg-panel card: surface fill, no border, full width, at least 44 pt.
  card: { minHeight: minTouchTarget, padding: spacing[3], gap: 2, backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden' },
  // Web's hover mix: ink 7% over surface. Muted text keeps 4.5:1 on it (hub.spec checks).
  cardPressed: { backgroundColor: PRESSED_SURFACE },
  // Web's NEXT_BAR: 3 pt of accent-700 down the left edge, drawn inside so nothing shifts.
  nextBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: colors['accent-700'] },
  top: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[1], justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 15, lineHeight: 22, color: colors.ink },
  state: { flexDirection: 'row', alignItems: 'center', gap: spacing[1] },
  continue: { fontSize: 15, lineHeight: 22, color: colors['accent-700'] },
  plain: { paddingVertical: spacing[2], gap: 2 },
});

/** A step in the full plan: stays focusable and explained, and a press asks for the paywall. */
function LockedStep(props: { title: string; body: string; meta?: string; reason: string; onLocked: (opener: unknown) => void }) {
  const reasonId = useId();
  const row = useRef<unknown>(null);
  return (
    <Row
      ariaDisabled
      rowRef={row}
      describedBy={reasonId}
      hint={props.reason}
      onPress={() => props.onLocked(row.current)}
      // Decorative: the reason text and hint are what assistive tech reads.
      trailing={<Icon name="lock" testID="lock-icon" color={colors['neutral-700']} trailing />}
    >
      <Body tone="strong">{props.title}</Body>
      <Body>{props.body}</Body>
      <Meta meta={props.meta} />
      <Body id={reasonId} hidden small>
        {props.reason}
      </Body>
    </Row>
  );
}
