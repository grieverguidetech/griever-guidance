import { useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ChecklistRows } from '../screens/WhatYoullNeedScreen';
import { ACCENT, ACCENT_TINT, MUTED } from './colors';

/**
 * A panel over the current screen. The Close button and Android's Back both shut it. The screen
 * underneath stays mounted, so nothing typed there is lost. Reusable for other short panels (#194).
 */
export function Sheet({ title, visible, onClose, children }: { title: string; visible: boolean; onClose: () => void; children: ReactNode }) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        {/* Hides everything behind the sheet from VoiceOver. */}
        <View style={styles.panel} accessibilityViewIsModal accessibilityLabel={title}>
          <View style={styles.header}>
            <Text style={styles.title} accessibilityRole="header">{title}</Text>
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [styles.close, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.body}>{children}</ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/** The "What you'll need" checklist in a sheet. Ticks are the same saved ticks as the full screen. */
export function WhatYoullNeedSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [tipOpen, setTipOpen] = useState<string | null>(null);
  return (
    <Sheet title="What you'll need" visible={visible} onClose={onClose}>
      <Text style={styles.subtitle}>Not today. Just so none of it surprises you.</Text>
      <ChecklistRows tipOpen={tipOpen} onTipChange={setTipOpen} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  panel: { maxHeight: '85%', backgroundColor: '#ffffff', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title: { fontSize: 18, fontWeight: '600', color: '#111827', flex: 1 },
  close: {
    minHeight: 44,
    minWidth: 44,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: ACCENT,
    borderRadius: 10,
    backgroundColor: ACCENT_TINT,
  },
  closeText: { fontSize: 14, color: ACCENT, fontWeight: '500' },
  pressed: { opacity: 0.7 },
  body: { paddingBottom: 24 },
  subtitle: { fontSize: 13, color: MUTED, marginBottom: 16 },
});
