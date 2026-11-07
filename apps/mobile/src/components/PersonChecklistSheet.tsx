import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fill, screenCopy } from '@griever/copy';
import { computeChecklist } from '@griever/hooks';
import { TIME_PHASE_KEYS } from '@griever/shared';
import type { ChecklistFields, ChecklistPhaseKey } from '@griever/shared';
import { colors, minTouchTarget, radius, spacing } from '@griever/tokens';
import { Sheet, SerifText as Text } from '../ui';
import { ACCENT, MUTED } from './colors';

const copy = screenCopy('phoneChecklist');
const checklistCopy = screenCopy('cmsChecklist');

/** The saved list of Gather ticks on this phone (the same key the "What you'll need" screen writes). */
const GATHER_KEY = 'gg.checklist.v1';
/** The five Gather items. Done when every one is ticked; Gather has no "Doesn't apply". */
export const GATHER_ITEM_IDS = ['will', 'plans', 'ssn', 'insurance', 'military'] as const;

export type ChecklistGroupId = ChecklistPhaseKey | 'gather';

export interface PersonChecklistSheetProps {
  visible: boolean;
  onClose: () => void;
  onDismiss?: () => void;
  /** The open person's phase ticks (from useSessions). Missing means nothing is ticked yet. */
  checklist: ChecklistFields['checklist'];
  /** A group was tapped. The panel with the tick rows is opened by the caller. */
  onOpenGroup: (groupId: ChecklistGroupId) => void;
}

/** True when every Gather item is in the saved list. */
export function isGatherDone(ticked: readonly string[]): boolean {
  return GATHER_ITEM_IDS.every((id) => ticked.includes(id));
}

/** Reads the Gather ticks on this phone. A missing or broken value counts as nothing ticked. */
async function readGatherTicks(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(GATHER_KEY);
    const saved: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(saved) ? saved.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * The checklist as groups: the four time phases in their real order (C10), then "Gather when you
 * can". Each group is a button; a group whose items are all ticked or "Doesn't apply" says Done.
 * No counts and no percentages (SE-5). Ticks stay on this phone. Nothing here deletes anything (C9).
 */
export function PersonChecklistSheet({ visible, onClose, onDismiss, checklist, onOpenGroup }: PersonChecklistSheetProps) {
  const [gatherTicks, setGatherTicks] = useState<string[]>([]);
  // Read again each time the sheet opens, so a tick made on the Gather screen shows here.
  useEffect(() => {
    if (!visible) {
      return;
    }
    let live = true;
    readGatherTicks().then((ticks) => {
      if (live) {
        setGatherTicks(ticks);
      }
    });
    return () => {
      live = false;
    };
  }, [visible]);

  const { phases } = computeChecklist({ checklist });
  const groups: { id: ChecklistGroupId; label: string; done: boolean }[] = [
    ...TIME_PHASE_KEYS.map((key) => ({
      id: key,
      label: checklistCopy.phases[key],
      done: phases.find((phase) => phase.key === key)?.done ?? false,
    })),
    { id: 'gather', label: checklistCopy.gatherHeading, done: isGatherDone(gatherTicks) },
  ];

  return (
    <Sheet title={copy.title} closeLabel={copy.close} visible={visible} onClose={onClose} onDismiss={onDismiss}>
      <Text style={styles.note}>{copy.staysOnPhone}</Text>
      {groups.map((group) => (
        <Pressable
          key={group.id}
          role="button"
          accessibilityLabel={group.done ? fill(copy.groupDone, { group: group.label }) : group.label}
          accessibilityHint={copy.groupHint}
          onPress={() => onOpenGroup(group.id)}
          style={({ pressed }) => [styles.group, pressed && styles.pressed]}
        >
          <Text style={styles.label}>{group.label}</Text>
          {group.done ? (
            <View style={styles.done} accessible={false} importantForAccessibility="no">
              <Text style={styles.check} allowFontScaling={false}>
                ✓
              </Text>
              <Text style={styles.doneText}>{checklistCopy.done}</Text>
            </View>
          ) : null}
        </Pressable>
      ))}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  note: { fontSize: 13, color: MUTED, marginBottom: spacing[2] },
  group: {
    minHeight: minTouchTarget,
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
    borderWidth: 1,
    borderColor: colors['neutral-600'],
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[2],
  },
  pressed: { backgroundColor: colors['accent-100'] },
  label: { flex: 1, fontSize: 16, color: colors.ink },
  done: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  check: { fontSize: 16, color: ACCENT, fontWeight: '700' },
  doneText: { fontSize: 14, color: ACCENT },
});
