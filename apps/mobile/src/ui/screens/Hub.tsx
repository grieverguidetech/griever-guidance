import { useId, useRef } from 'react';
import type { ReactNode, Ref } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { colors, radius, spacing } from '@griever/tokens';
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
  /** The one card to do now. Exactly one row has this. It reads "Next" and its press starts the step. */
  lit?: boolean;
  /** In the full plan: stays focusable and opens the paywall placeholder. */
  locked: boolean;
  /** This host cannot do this step yet: shown with a calm reason, and not pressable. */
  unavailable?: boolean;
  /**
   * The small status line under a step, already built (for example doneRowMeta in libs/copy, or
   * "Ready"). Shown on any row, and part of the row's accessible name. Optional: web passes it on done rows only.
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

  if (row.lit) {
    // The one lit card: a single press target. "Next" is in its name; the bottom button does the same.
    const tag = row.started ? `${copy.tagNext} · ${copy.tagStarted}` : copy.tagNext;
    return (
      // The pressable is the whole visible card: border and padding sit on it, so there is no dead band.
      <Pressable role="button" onPress={() => onStart(row.key)} style={styles.lit}>
        <Phrasing>
          <Body tone="muted" small>
            {tag}
          </Body>
          <Body tone="strong">{text.title}</Body>
          <Body>{text.body}</Body>
          <Meta meta={row.meta} />
        </Phrasing>
      </Pressable>
    );
  }

  if (row.status === 'done') {
    // Compact: the title and what was sent, on one row. Opens this step's message: a draft still
    // under way comes back, otherwise it is new and empty, because a finished send keeps no wording (C2).
    return (
      <Row bordered onPress={() => onStart(row.key)}>
        <Body tone="strong">{[text.title, row.meta, row.started ? copy.metaStarted : ''].filter(Boolean).join(' · ')}</Body>
      </Row>
    );
  }

  return (
    <Row bordered onPress={() => onStart(row.key)}>
      <Body tone="strong">{row.started ? `${text.title} · ${copy.metaStarted}` : text.title}</Body>
      <Body>{text.body}</Body>
      <Meta meta={row.meta} />
    </Row>
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
  lit: { gap: spacing[2], padding: spacing[3], backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 2, borderColor: colors.accent },
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
