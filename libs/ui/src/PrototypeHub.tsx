// PROTOTYPE #322: the hub as React Native components. Throwaway. Renders on web via react-native-web.
import type { ReactNode, Ref } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { PrototypePathLandingCopy, PrototypeMomentKey } from '@griever/copy';
import { fill } from '@griever/copy';
import {
  PROTOTYPE_COLORS as C,
  PROTOTYPE_FONT_SERIF_NATIVE,
  PROTOTYPE_FONT_SERIF_WEB,
  PROTOTYPE_RADIUS,
  PROTOTYPE_SPACING as S,
} from '@griever/tokens';

const serif = Platform.OS === 'web' ? PROTOTYPE_FONT_SERIF_WEB : PROTOTYPE_FONT_SERIF_NATIVE;

export interface PrototypeHubRow {
  key: PrototypeMomentKey;
  status: 'done' | 'next' | 'later';
  started: boolean;
  locked: boolean;
  /** Pre-formatted "2 people · May 30" for done rows. */
  meta?: string;
}

export interface PrototypeHubProps {
  copy: PrototypePathLandingCopy;
  personName: string;
  rows: PrototypeHubRow[];
  lockedReason: string;
  onBack: () => void;
  onChecklist: () => void;
  onEditPerson: () => void;
  onStartMoment: (key: PrototypeMomentKey) => void;
  /** `target` is the pressed element on web (for returning focus), undefined on native. */
  onLockedPress: (target: unknown) => void;
  /** The finish note and the share button stay owned by the host screen in this prototype. */
  children?: ReactNode;
  // Refs are untyped on purpose: a DOM node on web, a host instance on native.
  headingRef?: Ref<any>;
  checklistRef?: Ref<any>;
}

// react-native types lack aria-level; react-native-web reads it to choose h1 to h6.
const h1Props = { role: 'heading', 'aria-level': 1, accessibilityRole: 'header' } as Record<string, unknown>;

// PROTOTYPE #322: Pressable maps aria-disabled onto its `disabled` prop, which makes the web button
// unfocusable. The locked row must stay focusable (#292), so the attribute is set on the node by hand.
function markAriaDisabled(node: unknown) {
  if (Platform.OS === 'web' && node) {
    (node as { setAttribute: (k: string, v: string) => void }).setAttribute('aria-disabled', 'true');
  }
}

export function PrototypeHub(props: PrototypeHubProps) {
  const { copy } = props;
  return (
    <View style={styles.screen}>
      <View style={styles.topBar}>
        <Pressable role="button" onPress={props.onBack} style={styles.barButton}>
          <Text style={styles.barText}>{copy.back}</Text>
        </Pressable>
        <Pressable
          ref={props.checklistRef}
          role="button"
          aria-haspopup="dialog"
          onPress={props.onChecklist}
          style={[styles.barButton, styles.right]}
        >
          <Text style={styles.barText}>{copy.checklist}</Text>
        </Pressable>
      </View>
      <View style={styles.headBlock}>
        <View style={styles.eyebrowRow}>
          <Text style={styles.eyebrow}>{fill(copy.forName, { name: props.personName })}</Text>
          <Pressable role="button" onPress={props.onEditPerson} style={styles.ghost}>
            <Text style={styles.ghostText}>{copy.editPerson}</Text>
          </Pressable>
        </View>
        <Text ref={props.headingRef} style={styles.h1} {...h1Props}>
          {copy.heading}
        </Text>
        <Text style={styles.intro}>{copy.intro}</Text>
      </View>
      {props.children}
      <View style={styles.rows}>
        {props.rows.map((row) => (
          <HubRow key={row.key} row={row} {...props} />
        ))}
      </View>
    </View>
  );
}

function HubRow({ row, copy, lockedReason, onStartMoment, onLockedPress }: PrototypeHubProps & { row: PrototypeHubRow }) {
  const text = copy.moments[row.key];
  if (row.locked) {
    return (
      <Pressable
        role="button"
        ref={markAriaDisabled}
        aria-describedby={`proto-locked-${row.key}`}
        onPress={(e) => onLockedPress((e as { currentTarget?: unknown }).currentTarget)}
        style={styles.plainRow}
      >
        <Text style={styles.rowTitle}>{text.title}</Text>
        <Text style={styles.rowBody}>{text.body}</Text>
        <Text id={`proto-locked-${row.key}`} aria-hidden style={styles.rowBody}>
          {lockedReason}
        </Text>
      </Pressable>
    );
  }
  if (row.status === 'done') {
    return (
      <Pressable role="button" onPress={() => onStartMoment(row.key)} style={styles.plainRow}>
        <Text style={styles.rowTitle}>{text.doneLabel}</Text>
        <Text style={styles.meta}>{row.meta}</Text>
      </Pressable>
    );
  }
  if (row.status === 'next') {
    return (
      <View style={styles.card}>
        <Text style={styles.tag}>{row.started ? copy.tagStarted : copy.tagNext}</Text>
        <Text style={styles.cardTitle}>{text.title}</Text>
        <Text style={styles.rowBody}>{text.body}</Text>
        <Pressable role="button" onPress={() => onStartMoment(row.key)} style={styles.primary}>
          <Text style={styles.primaryText}>{row.started ? copy.continue : copy.start}</Text>
        </Pressable>
      </View>
    );
  }
  return (
    <Pressable role="button" onPress={() => onStartMoment(row.key)} style={styles.plainRow}>
      <Text style={styles.rowTitle}>
        {text.title}
        {row.started ? <Text style={styles.meta}> · {copy.metaStarted}</Text> : null}
      </Text>
      <Text style={styles.rowBody}>{text.body}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { gap: S[3], paddingTop: 52 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  barButton: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: S[3],
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.neutral600,
    borderRadius: PROTOTYPE_RADIUS.md,
  },
  right: { marginLeft: 'auto' },
  barText: { fontFamily: serif, fontWeight: '600', fontSize: 14, color: C.accent700 },
  headBlock: { gap: S[1] },
  eyebrowRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eyebrow: { fontFamily: serif, fontSize: 11, letterSpacing: 1.1, textTransform: 'uppercase', color: C.accent700 },
  ghost: { minHeight: 44, justifyContent: 'center', paddingHorizontal: S[1] },
  ghostText: { fontFamily: serif, fontWeight: '600', fontSize: 12, color: C.accent700 },
  h1: { fontFamily: serif, fontWeight: '600', fontSize: 22, color: C.ink },
  intro: { fontFamily: serif, fontSize: 13, color: C.neutral700 },
  rows: { gap: S[2] },
  plainRow: { paddingVertical: S[2], minHeight: 44, gap: 2 },
  rowTitle: { fontFamily: serif, fontSize: 15, color: C.neutral700 },
  rowBody: { fontFamily: serif, fontSize: 13, lineHeight: 20, color: C.neutral800 },
  meta: { fontFamily: serif, fontSize: 12, color: C.neutral700 },
  card: {
    gap: S[2],
    padding: S[3],
    backgroundColor: C.surface,
    borderRadius: PROTOTYPE_RADIUS.md,
    borderWidth: 2,
    borderColor: C.accent,
  },
  tag: { fontFamily: serif, fontSize: 11, color: C.accent800, alignSelf: 'flex-start' },
  cardTitle: { fontFamily: serif, fontWeight: '600', fontSize: 17, color: C.ink },
  primary: {
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: C.accent700,
    borderRadius: PROTOTYPE_RADIUS.md,
    marginTop: S[2],
  },
  primaryText: { fontFamily: serif, fontWeight: '600', fontSize: 14, color: C.bg },
});
