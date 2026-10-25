import { useEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { AccessibilityInfo, findNodeHandle, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ChecklistRows } from '../screens/WhatYoullNeedScreen';
import { ACCENT, ACCENT_TINT, MUTED } from './colors';

/**
 * A panel over the current screen. The Close button and Android's Back both shut it. The screen
 * underneath stays mounted, so nothing typed there is lost. Reusable for other short panels (#194).
 */
export function Sheet({
  title,
  visible,
  onClose,
  onRequestClose,
  onDismiss,
  onBodyTouch,
  children,
}: {
  title: string;
  visible: boolean;
  onClose: () => void;
  /** Android Back. Defaults to onClose; a sheet with an open tip can close the tip first. */
  onRequestClose?: () => void;
  /** After the sheet has closed (iOS only): the caller sends focus back to its button. */
  onDismiss?: () => void;
  /** A touch inside the body, e.g. to close an open tip. */
  onBodyTouch?: () => void;
  children: ReactNode;
}) {
  const heading = useRef<ComponentRef<typeof Text>>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled?.()
      ?.then(setReduceMotion)
      .catch(() => undefined);
  }, []);
  // Screen-reader focus starts on the sheet title, not on whatever was behind it.
  const focusHeading = () => {
    const handle = heading.current ? findNodeHandle(heading.current) : null;
    if (handle) AccessibilityInfo.setAccessibilityFocus(handle);
  };
  return (
    <Modal
      visible={visible}
      animationType={reduceMotion ? 'none' : 'slide'}
      transparent
      onRequestClose={onRequestClose ?? onClose}
      onShow={focusHeading}
      onDismiss={onDismiss}
    >
      <View style={styles.backdrop}>
        {/* A tap on the dimmed area closes the sheet. Screen readers use the Close button. */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessible={false} importantForAccessibility="no" />
        {/* Hides everything behind the sheet from VoiceOver. Two-finger Z closes it. */}
        <View style={styles.panel} accessibilityViewIsModal accessibilityLabel={title} onAccessibilityEscape={onClose}>
          <View style={styles.header}>
            <Text ref={heading} style={styles.title} accessibilityRole="header">{title}</Text>
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [styles.close, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" onTouchStart={onBodyTouch}>{children}</ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/** The "What you'll need" checklist in a sheet. Ticks are the same saved ticks as the full screen. */
export function WhatYoullNeedSheet({ visible, onClose, onDismiss }: { visible: boolean; onClose: () => void; onDismiss?: () => void }) {
  const [tipOpen, setTipOpen] = useState<string | null>(null);
  const close = () => {
    setTipOpen(null);
    onClose();
  };
  return (
    <Sheet
      title="What you'll need"
      visible={visible}
      onClose={close}
      // Back closes an open tip first, then the sheet.
      onRequestClose={() => (tipOpen ? setTipOpen(null) : close())}
      onDismiss={onDismiss}
      onBodyTouch={() => setTipOpen(null)}
    >
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
