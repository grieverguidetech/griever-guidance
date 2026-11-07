import { Pressable, StyleSheet, View } from 'react-native';
import { fill, screenCopy } from '@griever/copy';
import { computeChecklist } from '@griever/hooks';
import { TIME_PHASE_KEYS } from '@griever/shared';
import type { ChecklistFields, ChecklistPhaseKey } from '@griever/shared';
import { colors, minTouchTarget, radius, spacing } from '@griever/tokens';
import { Sheet, SerifText as Text } from '../ui';
import { MUTED } from './colors';

const copy = screenCopy('phoneChecklist');
const checklistCopy = screenCopy('cmsChecklist');

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

/**
 * The checklist as groups: the four time phases in their real order (C10), then "Gather when you
 * can". Each group is a button; a phase whose items are all ticked or marked not applicable says Done.
 * Gather never says Done, as on web: its ticks stay on the device and are not read here.
 * No counts and no percentages (SE-5). Ticks stay on this phone. Nothing here deletes anything (C9).
 */
export function PersonChecklistSheet({ visible, onClose, onDismiss, checklist, onOpenGroup }: PersonChecklistSheetProps) {
  const { phases } = computeChecklist({ checklist });
  const groups: { id: ChecklistGroupId; label: string; done: boolean }[] = [
    ...TIME_PHASE_KEYS.map((key) => ({
      id: key,
      label: checklistCopy.phases[key],
      done: phases.find((phase) => phase.key === key)?.done ?? false,
    })),
    { id: 'gather', label: checklistCopy.gatherHeading, done: false },
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
            <View style={styles.done} importantForAccessibility="no">
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
  check: { fontSize: 16, color: colors['success-700'], fontWeight: '700' },
  doneText: { fontSize: 14, color: colors['success-700'] },
});
