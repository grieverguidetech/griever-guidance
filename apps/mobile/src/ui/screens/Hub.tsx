import { useId, useRef } from 'react';
import type { ReactNode, Ref } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { colors, minTouchTarget, radius, spacing } from '@griever/tokens';
import { Button } from '../Button';
import { Icon } from '../Icon';
import type { ButtonNode } from '../Button';
import { Phrasing } from '../phrasing';
import { Heading } from '../Heading';
import { Row } from '../Row';
import { Body, Eyebrow } from '../Text';
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
  continue: string;
  tagNext: string;
  /** The state words that end each row's accessible name. */
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
  /** Drawn as one icon at the trailing edge, and read as a word at the end of the row's name. */
  state: HubRowState;
  /** The one card to do now. Exactly one row has this. It reads "Next" and its press starts the step. */
  lit?: boolean;
  /** In the full plan: stays focusable and opens the paywall placeholder. */
  locked: boolean;
  /** This host cannot do this step yet: shown with a calm reason, and not pressable. */
  unavailable?: boolean;
  /**
   * The one line under a step that names what is missing, for example "Needs the service date".
   * Shown on any row, and part of the row's accessible name. Status itself is the icon (`state`), never a sentence.
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

  const stateWord = stateWords(copy)[row.state];
  const icon = <StatusIcon state={row.state} />;

  if (row.lit) {
    // The one lit card: a single press target. "Next" is in its name; the bottom button does the same.
    return (
      <StatusPressable style={styles.lit} label={[copy.tagNext, text.title, text.body, row.meta, stateWord]} icon={icon} onPress={() => onStart(row.key)}>
        <Body tone="muted" small>
          {copy.tagNext}
        </Body>
        <Body tone="strong">{text.title}</Body>
        <Body>{text.body}</Body>
        <Meta meta={row.meta} />
      </StatusPressable>
    );
  }

  if (row.status === 'done') {
    // Compact: just the title. Opens this step's message: a draft still under way comes back,
    // otherwise it is new and empty, because a finished send keeps no wording (C2).
    return (
      <StatusPressable style={styles.row} label={[text.title, stateWord]} icon={icon} onPress={() => onStart(row.key)}>
        <Body tone="strong">{text.title}</Body>
      </StatusPressable>
    );
  }

  return (
    <StatusPressable style={styles.row} label={[text.title, text.body, row.meta, stateWord]} icon={icon} onPress={() => onStart(row.key)}>
      <Body tone="strong">{text.title}</Body>
      <Body>{text.body}</Body>
      <Meta meta={row.meta} />
    </StatusPressable>
  );
}

const stateWords = (copy: HubCopy): Record<HubRowState, string> => ({
  done: copy.stateDone,
  inProgress: copy.stateInProgress,
  notStarted: copy.stateNotStarted,
});

/** The status mark at the trailing edge. Decorative: the state word in the row's name carries the meaning. */
function StatusIcon({ state }: { state: HubRowState }) {
  if (state === 'done') {
    return <Icon name="check" testID="status-check" color={colors['success-700']} trailing />;
  }
  if (state === 'inProgress') {
    return <Icon name="progress" testID="status-progress" color={colors['neutral-700']} trailing />;
  }
  // neutral-600 is the lightest token with 3:1 contrast on the page (WCAG 1.4.11).
  return <Icon name="circle" testID="status-circle" color={colors['neutral-600']} trailing />;
}

/** A pressable card whose name is set whole, so it can end with the state word. */
function StatusPressable(props: { style: object; label: Array<string | undefined>; icon: ReactNode; onPress: () => void; children: ReactNode }) {
  return (
    <Pressable role="button" accessibilityLabel={props.label.filter(Boolean).join(', ')} onPress={props.onPress} style={props.style}>
      <Phrasing>{props.children}</Phrasing>
      {props.icon}
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

const styles = StyleSheet.create({
  screen: { gap: spacing[3] },
  topBar: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[1], justifyContent: 'space-between', alignItems: 'center' },
  head: { gap: spacing[1] },
  rows: { gap: spacing[2] },
  // Must match the selected style of Card (ui/Card.tsx): border 2, accent, radius md, surface, padding spacing[3].
  lit: { gap: spacing[2], padding: spacing[3], paddingRight: spacing[6], backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 2, borderColor: colors.accent },
  // Same edge as Row (ui/Row.tsx) when bordered, with room on the right for the status icon.
  row: { minHeight: minTouchTarget, paddingVertical: spacing[2], paddingHorizontal: spacing[3], paddingRight: spacing[6], gap: 2, borderWidth: 1, borderColor: colors['neutral-600'], borderRadius: radius.md },
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
