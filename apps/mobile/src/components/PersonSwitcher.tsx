import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Session } from '@griever/hooks';
import { PrimaryButton, ScreenHeader, authStyles } from './authForm';
import { ACCENT, MUTED } from './colors';

export const ADD_PERSON = "Someone else I've lost";
const UNNAMED = 'Someone new';

export const personLabel = (s: Session) => s.personName.trim() || UNNAMED;

/** Always-visible way in, shown on the first screen. Calm: a name and one plain link. */
export function PersonBar({ active, onOpen }: { active: Session; onOpen: () => void }) {
  return (
    <View style={styles.bar}>
      <Text style={styles.barText}>Writing about {personLabel(active)}</Text>
      <Pressable
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
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
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
            accessibilityLabel={`${personLabel(s)}${s.dateOfPassing ? `, ${s.dateOfPassing}` : ''}${current ? ', current' : ''}`}
          >
            <Text style={styles.rowName}>{personLabel(s)}</Text>
            {s.dateOfPassing ? <Text style={styles.rowMeta}>{s.dateOfPassing}</Text> : null}
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
  rowMeta: { fontSize: 13, color: MUTED, marginTop: 2 },
});
