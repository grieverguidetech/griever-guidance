import type { ReactNode, Ref } from 'react';
import { StyleSheet, View } from 'react-native';
import { spacing } from '@griever/tokens';
import { Button } from '../Button';
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
  /** `opener` is the pressed row on web, so focus can go back to it. Undefined on native. */
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
        <Button label={copy.back} variant="tinted" onPress={props.onBack} />
        <Button
          label={copy.checklist}
          variant="tinted"
          opensDialog
          onPress={props.onWhatYoullNeed}
          buttonRef={props.checklistRef}
        />
      </View>
      <View style={styles.head}>
        <View style={styles.eyebrowRow}>
          <Eyebrow>{props.eyebrow}</Eyebrow>
          <Button label={copy.editPerson} variant="ghost" onPress={props.onEdit} />
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

  if (row.locked) {
    const reasonId = `hub-locked-${row.key}`;
    return (
      <Row
        ariaDisabled
        describedBy={reasonId}
        hint={copy.lockedReason}
        onPress={(event) => onLocked((event as { currentTarget?: unknown } | undefined)?.currentTarget)}
      >
        <Body tone="strong">{text.title}</Body>
        <Body>{text.body}</Body>
        <Body id={reasonId} hidden small>
          {copy.lockedReason}
        </Body>
      </Row>
    );
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
});
