import { useEffect, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import { AccessibilityInfo, findNodeHandle, Modal, PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '@griever/tokens';
import { Button } from './Button';
import { Heading } from './Heading';
import type { SheetProps } from './sheetProps';

export type { SheetProps } from './sheetProps';

/** How far a downward drag on the grab bar must go to close the sheet, in points. */
const SWIPE_CLOSE_DISTANCE = 60;

/** Opt-in extras for a sheet that holds a whole list. The checklist, More and paywall sheets leave them unset. */
export interface SheetExtras {
  /** A grab bar at the top; dragging it down closes the sheet. A screen-reader user has Close. */
  swipeToClose?: boolean;
  /** The children bring their own title and Close button and scroll by themselves, so the sheet draws neither. */
  bare?: boolean;
  /** Runs when the sheet has opened. With `bare` the caller uses it to focus its own title. */
  onShow?: () => void;
}

/**
 * A bottom sheet over the current screen, the same look as the web one (Sheet.web.tsx). The Close
 * button and Android's Back both shut it. The screen underneath stays mounted, so nothing typed
 * there is lost. Screen-reader focus starts on the title; the caller sends it back on dismiss.
 */
export function Sheet({ title, closeLabel, visible = true, onClose, onRequestClose, onDismiss, onBodyTouch, swipeToClose = false, bare = false, onShow, children }: SheetProps & SheetExtras) {
  const heading = useRef<ComponentRef<typeof Text>>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled?.()
      ?.then(setReduceMotion)
      .catch(() => undefined);
    // The setting can change while the app is open.
    const subscription = AccessibilityInfo.addEventListener?.('reduceMotionChanged', setReduceMotion);
    return () => subscription?.remove();
  }, []);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const swipe = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      // A list underneath may take the gesture (scrolling wins); a taken gesture closes nothing.
      onPanResponderTerminationRequest: () => true,
      onPanResponderTerminate: () => undefined,
      onPanResponderRelease: (_event, gesture) => {
        if (gesture.dy > SWIPE_CLOSE_DISTANCE) {
          closeRef.current();
        }
      },
    }),
  ).current;
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
      onShow={() => {
        focusHeading();
        onShow?.();
      }}
      onDismiss={onDismiss}
    >
      <View style={styles.backdrop}>
        {/* A tap on the dimmed area closes the sheet. Screen readers use the Close button. */}
        <Pressable testID="sheet-dim" style={StyleSheet.absoluteFill} onPress={onClose} accessible={false} importantForAccessibility="no" />
        {/* Hides everything behind the sheet from VoiceOver. Two-finger Z closes it. */}
        <View style={[styles.panel, bare && styles.bare]} accessibilityViewIsModal accessibilityLabel={title} onAccessibilityEscape={onClose}>
          {swipeToClose ? (
            <View testID="sheet-grab-bar" style={styles.grab} accessible={false} importantForAccessibility="no" {...swipe.panHandlers}>
              <View style={styles.grabBar} />
            </View>
          ) : null}
          {bare ? (
            children
          ) : (
            <>
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
            </>
          )}
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
  bare: { height: '85%', padding: 0 },
  grab: { alignItems: 'center', justifyContent: 'center', minHeight: 44 },
  grabBar: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors['neutral-300'] },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing[2], marginBottom: spacing[2] },
  title: { flex: 1 },
  body: { paddingBottom: spacing[6], gap: spacing[3] },
});
