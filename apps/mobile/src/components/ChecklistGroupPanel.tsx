import { useEffect, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  AccessibilityInfo,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { fill, screenCopy } from '@griever/copy';
import { computeChecklist } from '@griever/hooks';
import type {
  ChecklistFields,
  ChecklistItemId,
  ChecklistItemState,
} from '@griever/shared';
import { colors, minTouchTarget, radius, spacing } from '@griever/tokens';
import { Button, Heading, focusNode, SerifText as Text } from '../ui';
import { CHECKLIST, CHECKLIST_KEY } from '../screens/WhatYoullNeedScreen';
import { NOT_SAVED_NOTE_TEXT } from './SavedNote';
import { ACCENT, FIELD_BORDER, MUTED } from './colors';
import type { ChecklistGroupId } from './PersonChecklistSheet';

const copy = screenCopy('phoneChecklist');
const checklistCopy = screenCopy('cmsChecklist');

export interface ChecklistGroupPanelProps {
  groupId: ChecklistGroupId;
  /** The open person's phase ticks (from useSessions). */
  checklist: ChecklistFields['checklist'];
  /** Saves one item on the person: a state, or null to clear it. Never deletes (C9). */
  onSetItem: (id: ChecklistItemId, state: ChecklistItemState | null) => void;
  onBack: () => void;
  onClose: () => void;
}

/**
 * One group's items, drawn inside the sheet's own Modal (the sheet is `bare`, so this brings its
 * title, Back and Close). A phase's items are saved on the person, on this phone. Gather's five items
 * are the device ticks in `gg.checklist.v1` and are separate from the phase items.
 * Ticking again clears the tick. No counts (SE-5), no swipe actions, no delete (C9).
 */
export function ChecklistGroupPanel({
  groupId,
  checklist,
  onSetItem,
  onBack,
  onClose,
}: ChecklistGroupPanelProps) {
  const title = useRef<ComponentRef<typeof Text>>(null);
  const label =
    groupId === 'gather'
      ? checklistCopy.gatherHeading
      : checklistCopy.phases[groupId];

  // Focus goes to the title when the panel opens. Deferred a tick, as on the hub, so the
  // screen reader takes it after the swap has drawn.
  useEffect(() => {
    const timer = setTimeout(() => focusNode(title.current), 0);
    return () => clearTimeout(timer);
  }, []);

  // One polite announcement when this phase becomes Done while the panel is open. No counts.
  const done =
    groupId === 'gather'
      ? false
      : (computeChecklist({ checklist }).phases.find(
          (phase) => phase.key === groupId,
        )?.done ?? false);
  const wasDone = useRef(done);
  useEffect(() => {
    if (done && !wasDone.current) {
      const message = fill(copy.phaseNowDone, { group: label });
      // Queued behind the focus move so it is read, not dropped. Some runtimes lack the options form.
      if (AccessibilityInfo.announceForAccessibilityWithOptions) {
        AccessibilityInfo.announceForAccessibilityWithOptions(message, {
          queue: true,
        });
      } else {
        AccessibilityInfo.announceForAccessibility(message);
      }
    }
    wasDone.current = done;
  }, [done, label]);

  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <Button label={checklistCopy.back} variant="header" onPress={onBack} />
        <View style={styles.close}>
          <Button label={copy.close} variant="secondary" onPress={onClose} />
        </View>
      </View>
      <View style={styles.titleRow}>
        <Heading level={2} headingRef={title}>
          {label}
        </Heading>
      </View>
      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        {groupId === 'gather' ? (
          <GatherRows />
        ) : (
          <PhaseRows
            groupId={groupId}
            checklist={checklist}
            onSetItem={onSetItem}
          />
        )}
      </ScrollView>
    </View>
  );
}

function PhaseRows({
  groupId,
  checklist,
  onSetItem,
}: Pick<ChecklistGroupPanelProps, 'checklist' | 'onSetItem'> & {
  groupId: Exclude<ChecklistGroupId, 'gather'>;
}) {
  const phase = computeChecklist({ checklist }).phases.find(
    (entry) => entry.key === groupId,
  );
  return (
    <>
      {(phase?.items ?? []).map((item) => {
        const itemLabel = checklistCopy.items[item.id];
        // As on web, a saved not_applicable shows as done: the tick shows and pressing it clears.
        const finished =
          item.state === 'done' || item.state === 'not_applicable';
        return (
          <View key={item.id} style={styles.item}>
            <TickRow
              label={itemLabel}
              text={itemLabel}
              checked={finished}
              onPress={() => onSetItem(item.id, finished ? null : 'done')}
            />
          </View>
        );
      })}
    </>
  );
}

/** Gather: the same five items and the same saved device ticks as the Gather screen. */
function GatherRows() {
  const [ticked, setTicked] = useState<string[]>([]);
  // Rows show once the saved ticks are read, so a tap can never overwrite them with a partial list.
  const [loaded, setLoaded] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const latest = useRef<string[]>([]);
  latest.current = ticked;
  useEffect(() => {
    let live = true;
    AsyncStorage.getItem(CHECKLIST_KEY)
      .then((raw) => {
        const saved: unknown = raw ? JSON.parse(raw) : [];
        if (live && Array.isArray(saved)) {
          setTicked(saved.filter((x): x is string => typeof x === 'string'));
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (live) {
          setLoaded(true);
        }
      });
    return () => {
      live = false;
    };
  }, []);

  const toggle = (id: string) => {
    const before = latest.current;
    const next = before.includes(id)
      ? before.filter((x) => x !== id)
      : [...before, id];
    latest.current = next; // a second quick tap builds on this one
    setTicked(next);
    AsyncStorage.setItem(CHECKLIST_KEY, JSON.stringify(next)).then(
      () => setSaveFailed(false),
      () => {
        setSaveFailed(true);
        // Android reads the live region below; iOS needs this announcement.
        if (Platform.OS === 'ios') {
          AccessibilityInfo.announceForAccessibility(NOT_SAVED_NOTE_TEXT);
        }
      },
    );
  };

  return (
    <>
      <View accessibilityLiveRegion="polite">
        {saveFailed ? (
          <Text style={styles.meta}>{NOT_SAVED_NOTE_TEXT}</Text>
        ) : null}
      </View>
      {loaded
        ? CHECKLIST.map((item) => (
            <View key={item.id} style={styles.item}>
              <TickRow
                label={item.meta ? `${item.label}. ${item.meta}` : item.label}
                text={item.label}
                checked={ticked.includes(item.id)}
                onPress={() => toggle(item.id)}
              />
              {item.meta ? (
                // Already in the tick row's label, so hidden from screen readers here.
                <View
                  accessible={false}
                  importantForAccessibility="no-hide-descendants"
                  accessibilityElementsHidden
                >
                  <Text style={styles.meta}>{item.meta}</Text>
                </View>
              ) : null}
              {item.tip ? <Text style={styles.meta}>{item.tip}</Text> : null}
            </View>
          ))
        : null}
    </>
  );
}

/** The one large tick target: full width, at least 44 pt tall. Done rows are struck through. */
function TickRow({
  label,
  text,
  checked,
  onPress,
}: {
  label: string;
  text: string;
  checked: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      role="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked }}
      onPress={onPress}
      style={({ pressed }) => [styles.tick, pressed && styles.pressed]}
    >
      <View
        style={[styles.box, checked && styles.boxOn]}
        importantForAccessibility="no"
      >
        {checked ? (
          <Text style={styles.mark} allowFontScaling={false}>
            ✓
          </Text>
        ) : null}
      </View>
      <View style={styles.textBlock}>
        <Text style={[styles.text, checked && styles.struck]}>{text}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  panel: { flex: 1, padding: spacing[4] },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  close: { flexShrink: 0 },
  titleRow: { marginTop: spacing[3], marginBottom: spacing[2] },
  body: { paddingBottom: spacing[6], gap: spacing[3] },
  item: { gap: spacing[1] },
  tick: {
    minHeight: minTouchTarget,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
    borderWidth: 1,
    borderColor: colors['neutral-600'],
    borderRadius: radius.md,
  },
  pressed: { backgroundColor: colors['accent-100'] },
  box: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: FIELD_BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { borderColor: ACCENT, backgroundColor: ACCENT },
  mark: { fontSize: 16, color: colors.surface, fontWeight: '700' },
  textBlock: { flex: 1 },
  text: { fontSize: 16, color: colors.ink },
  struck: { textDecorationLine: 'line-through', color: MUTED },
  meta: { fontSize: 15, color: MUTED, paddingHorizontal: spacing[3] },
});
