import { useId, useRef } from 'react';
import type { ReactNode, Ref } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { colors, spacing } from '@griever/tokens';
import { Button } from '../Button';
import { Icon } from '../Icon';
import type { ButtonNode } from '../Button';
import { Card } from '../Card';
import { Heading } from '../Heading';
import { Row } from '../Row';
import { Body, Eyebrow } from '../Text';
import type { HeadingProps } from '../Heading';

export type HubMomentKey = 'announce' | 'service' | 'obituary' | 'thanks';

/** The words the hub needs. libs/copy/screens/pathLanding.json has these keys, plus more. */
export interface HubCopy {
  heading: string;
  intro: string;
  back: string;
  checklist: string;
  editPerson: string;
  start: string;
  continue: string;
  tagStarted: string;
  tagNext: string;
  metaStarted: string;
  lockedReason: string;
  notInAppYet: string;
  moments: Record<HubMomentKey, { title: string; body: string; doneLabel: string }>;
}

export interface HubRow {
  key: HubMomentKey;
  /** done: finished. next: the one step to do now. later: a step after that. */
  status: 'done' | 'next' | 'later';
  /** Something was written for this step but not sent. */
  started: boolean;
  /** In the full plan: stays focusable and opens the paywall placeholder. */
  locked: boolean;
  /** This host cannot do this step yet: shown with a calm reason, and not pressable. */
  unavailable?: boolean;
  /** The small line under a done step, already built (see doneRowMeta in libs/copy). */
  meta?: string;
}

export interface HubProps {
  copy: HubCopy;
  /** The eyebrow line, for example "For Margaret". */
  eyebrow: string;
  rows: HubRow[];
  onBack: () => void;
  onWhatYoullNeed: () => void;
  onEdit: () => void;
  onStart: (key: HubMomentKey) => void;
  /** `opener` is the row's node (DOM node on web, host instance on native), so focus can go back to it. */
  onLocked: (opener: unknown) => void;
  /** Between the heading and the steps, for example the note after a send. */
  children?: ReactNode;
  /** After the steps. */
  footer?: ReactNode;
  headingRef?: HeadingProps['headingRef'];
  /** For the sheet that "What you'll need" opens to return focus to. */
  checklistRef?: Ref<ButtonNode>;
}

/**
 * The hub, "One thing at a time.": the steps of the plan for one person. Built from libs/ui so web
 * (through react-native-web) and mobile show the same screen. It owns no state; the host passes
 * the data and answers the callbacks.
 */
export function Hub(props: HubProps) {
  const { copy } = props;
  return (
    <View style={styles.screen}>
      <View style={styles.topBar}>
        <Button label={copy.back} variant="tertiary" onPress={props.onBack} />
        <Button
          label={copy.checklist}
          variant="tertiary"
          opensDialog
          onPress={props.onWhatYoullNeed}
          buttonRef={props.checklistRef}
        />
      </View>
      <View style={styles.head}>
        <View style={styles.eyebrowRow}>
          <View style={styles.eyebrowText}>
            <Eyebrow>{props.eyebrow}</Eyebrow>
          </View>
          <View style={styles.noShrink}>
            <Button label={copy.editPerson} variant="ghost" onPress={props.onEdit} />
          </View>
        </View>
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

function HubStep({ row, copy, onStart, onLocked }: HubProps & { row: HubRow }) {
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
    return <LockedStep title={text.title} body={text.body} reason={copy.lockedReason} onLocked={onLocked} />;
  }

  if (row.status === 'done') {
    // Opens a new, empty message for this step (C2: no old wording is kept).
    return (
      <Row onPress={() => onStart(row.key)}>
        <Body tone="muted">{text.doneLabel}</Body>
        <Body tone="muted" small>
          {row.meta}
        </Body>
      </Row>
    );
  }

  if (row.status === 'next') {
    return (
      <Card selected>
        <Body tone="muted" small>
          {row.started ? copy.tagStarted : copy.tagNext}
        </Body>
        <Body tone="strong">{text.title}</Body>
        <Body>{text.body}</Body>
        <Button label={row.started ? copy.continue : copy.start} onPress={() => onStart(row.key)} />
      </Card>
    );
  }

  return (
    <Row onPress={() => onStart(row.key)}>
      <Body tone="muted">{row.started ? `${text.title} · ${copy.metaStarted}` : text.title}</Body>
      <Body>{text.body}</Body>
    </Row>
  );
}

const styles = StyleSheet.create({
  screen: { gap: spacing[3] },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  head: { gap: spacing[1] },
  eyebrowRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rows: { gap: spacing[2] },
  // The name may be long; it wraps, and the Edit person button keeps its full width.
  eyebrowText: { flexShrink: 1 },
  noShrink: { flexShrink: 0 },
  plain: { paddingVertical: spacing[2], gap: 2 },
});

/** A step in the full plan: stays focusable and explained, and a press asks for the paywall. */
function LockedStep(props: { title: string; body: string; reason: string; onLocked: (opener: unknown) => void }) {
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
      <Body id={reasonId} hidden small>
        {props.reason}
      </Body>
    </Row>
  );
}
