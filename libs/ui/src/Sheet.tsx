import { useEffect, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import { AccessibilityInfo, findNodeHandle, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '@griever/tokens';
import { Button } from './Button';
import { Heading } from './Heading';
import type { SheetProps } from './sheetProps';

export type { SheetProps } from './sheetProps';

/**
 * A bottom sheet over the current screen, the same look as the web one (Sheet.web.tsx). The Close
 * button and Android's Back both shut it. The screen underneath stays mounted, so nothing typed
 * there is lost. Screen-reader focus starts on the title; the caller sends it back on dismiss.
 */
export function Sheet({ title, closeLabel, visible = true, onClose, onRequestClose, onDismiss, onBodyTouch, children }: SheetProps) {
  const heading = useRef<ComponentRef<typeof Text>>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled?.()
      ?.then(setReduceMotion)
      .catch(() => undefined);
  }, []);
  const focusHeading = () => {
    const handle = heading.current ? findNodeHandle(heading.current) : null;
    if (handle) {
      AccessibilityInfo.setAccessibilityFocus(handle);
    }
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
            <View style={styles.title}>
              <Heading level={2} headingRef={heading}>
                {title}
              </Heading>
            </View>
            <Button label={closeLabel} variant="secondary" onPress={onClose} />
          </View>
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" onTouchStart={onBodyTouch}>
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  panel: {
    maxHeight: '85%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: spacing[4],
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing[2], marginBottom: spacing[2] },
  title: { flex: 1 },
  body: { paddingBottom: spacing[6], gap: spacing[3] },
});
