import { useEffect, useRef } from 'react';
import { AccessibilityInfo, BackHandler, findNodeHandle, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Session } from '@griever/hooks';
import { PrimaryButton, ScreenHeader, announce, authStyles } from './authForm';
import { ACCENT, MUTED } from './colors';

export const ADD_PERSON = "Someone else I've lost";
const UNNAMED = 'Someone new';

export const personLabel = (s: Session) => s.personName.trim() || UNNAMED;

/**
 * Sits at the top of the first screen: a name and one plain link. When the person has just come
 * back from the switcher, it moves screen-reader focus to the link and says who is now open.
 */
export function PersonBar({
  active,
  onOpen,
  arrived,
  onArrived,
}: {
  active: Session;
  onOpen: () => void;
  arrived: boolean;
  onArrived: () => void;
}) {
  const insets = useSafeAreaInsets();
  const ref = useRef<View>(null);
  useEffect(() => {
    if (!arrived) return;
    const handle = ref.current ? findNodeHandle(ref.current) : null;
    if (handle) AccessibilityInfo.setAccessibilityFocus(handle);
    announce(`Now writing about ${personLabel(active)}`);
    onArrived();
  }, [arrived, active, onArrived]);
  return (
    <View style={[styles.bar, { paddingTop: insets.top + 8 }]}>
      <Text style={styles.barText}>Writing about {personLabel(active)}</Text>
      <Pressable
        ref={ref}
        style={styles.link}
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`Change who you are writing about. Currently ${personLabel(active)}`}
      >
        <Text style={styles.linkText}>Change</Text>
      </Pressable>
    </View>
  );
}

/** Lists everyone kept on this phone. Nothing here removes anyone (C9). */
export function PersonSwitcher({
  sessions,
  activeId,
  onPick,
  onAdd,
  onClose,
}: {
  sessions: Session[];
  activeId: string;
  onPick: (id: string) => void;
  onAdd: () => void;
  onClose: () => void;
}) {
  // Android's back button and the iOS two-finger "escape" both mean Back.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [onClose]);
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      accessible={false}
      onAccessibilityEscape={onClose}
    >
      <ScreenHeader>Who are you writing about?</ScreenHeader>
      <Text style={authStyles.body}>Each person is kept separately on this phone.</Text>
      {sessions.map((s) => {
        const current = s.id === activeId;
        return (
          <Pressable
            key={s.id}
            style={[styles.row, current && styles.rowCurrent]}
            onPress={() => onPick(s.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: current }}
            accessibilityLabel={`${personLabel(s)}${s.dateOfPassing ? `, ${s.dateOfPassing}` : ''}`}
          >
            <Text style={styles.rowName}>{personLabel(s)}</Text>
            {s.dateOfPassing ? <Text style={styles.rowMeta}>{s.dateOfPassing}</Text> : null}
            {current ? <Text style={styles.rowCurrentText}>Current</Text> : null}
          </Pressable>
        );
      })}
      <PrimaryButton label={ADD_PERSON} pending={false} onPress={onAdd} />
      <Pressable style={styles.link} onPress={onClose} accessibilityRole="button">
        <Text style={styles.linkText}>Back</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingBottom: 12,
    backgroundColor: '#ffffff',
  },
  barText: { flex: 1, fontSize: 14, color: MUTED },
  link: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 8 },
  linkText: { fontSize: 14, color: ACCENT, fontWeight: '500' },
  screen: { flex: 1, backgroundColor: '#ffffff' },
  content: { padding: 24, paddingTop: 60 },
  row: {
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: MUTED,
    borderRadius: 10,
    marginBottom: 12,
  },
  rowCurrent: { borderColor: ACCENT, borderWidth: 2 },
  rowName: { fontSize: 16, color: ACCENT, fontWeight: '500' },
  rowCurrentText: { fontSize: 13, color: ACCENT, fontWeight: '600', marginTop: 2 },
  rowMeta: { fontSize: 13, color: MUTED, marginTop: 2 },
});
