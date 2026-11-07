import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { fill, screenCopy } from '@griever/copy';
import { computeChecklist } from '@griever/hooks';
import { TIME_PHASE_KEYS } from '@griever/shared';
import type {
  ChecklistFields,
  ChecklistItemId,
  ChecklistItemState,
  ChecklistPhaseKey,
} from '@griever/shared';
import { colors, minTouchTarget, radius, spacing } from '@griever/tokens';
import { Sheet, focusNode, SerifText as Text } from '../ui';
import type { ButtonNode } from '../ui';
import { ChecklistGroupPanel } from './ChecklistGroupPanel';
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
  /** Saves one item on the person, on this phone: a state, or null to clear it. Never deletes (C9). */
  onSetItem: (id: ChecklistItemId, state: ChecklistItemState | null) => void;
  /** Told when a group is tapped. The sheet shows the group's panel itself. */
  onOpenGroup?: (groupId: ChecklistGroupId) => void;
}

/**
 * The checklist as groups: the four time phases in their real order (C10), then "Gather when you
 * can". Each group is a button; a phase whose items are all ticked or marked not applicable says Done.
 * Gather never says Done, as on web: its ticks stay on the device and are not read here.
 * No counts and no percentages (SE-5). Ticks stay on this phone. Nothing here deletes anything (C9).
 */
export function PersonChecklistSheet({
  visible,
  onClose,
  onDismiss,
  checklist,
  onSetItem,
  onOpenGroup,
}: PersonChecklistSheetProps) {
  // The open group's panel replaces the list inside this same Modal: one focus trap only.
  const [openId, setOpenId] = useState<ChecklistGroupId | null>(null);
  const groupButtons = useRef<
    Partial<Record<ChecklistGroupId, ButtonNode | null>>
  >({});
  const returnTo = useRef<ChecklistGroupId | null>(null);
  useEffect(() => {
    if (!visible) {
      setOpenId(null);
    }
  }, [visible]);
  // After Back, focus returns to the group that was open.
  useEffect(() => {
    if (openId === null && returnTo.current) {
      focusNode(groupButtons.current[returnTo.current] ?? null);
      returnTo.current = null;
    }
  }, [openId]);
  const back = () => {
    returnTo.current = openId;
    setOpenId(null);
  };
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
    <Sheet
      bare={openId !== null}
      title={
        openId === null
          ? copy.title
          : (groups.find((group) => group.id === openId)?.label ?? copy.title)
      }
      closeLabel={copy.close}
      visible={visible}
      onClose={onClose}
      onRequestClose={openId === null ? onClose : back}
      onDismiss={onDismiss}
    >
      {openId !== null ? (
        <ChecklistGroupPanel
          groupId={openId}
          checklist={checklist}
          onSetItem={onSetItem}
          onBack={back}
          onClose={onClose}
        />
      ) : (
        <>
          <Text style={styles.note}>{copy.staysOnPhone}</Text>
          {groups.map((group) => (
            <Pressable
              key={group.id}
              ref={(node) => {
                groupButtons.current[group.id] = node;
              }}
              role="button"
              accessibilityLabel={
                group.done
                  ? fill(copy.groupDone, { group: group.label })
                  : group.label
              }
              accessibilityHint={copy.groupHint}
              onPress={() => {
                setOpenId(group.id);
                onOpenGroup?.(group.id);
              }}
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
        </>
      )}
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
