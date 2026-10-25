import { useCallback, useEffect, useRef, type ComponentRef } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { AccessibilityInfo, BackHandler, findNodeHandle, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Session } from '@griever/hooks';
import { announce } from './authForm';
import { ACCENT, MUTED } from './colors';

const UNNAMED = 'Someone new';

export const personLabel = (s: Session) => s.personName.trim() || UNNAMED;

/**
 * Sits at the top of every step: who is open and one quiet link back to Home. When the person has
 * just come from Home, it moves screen-reader focus to the link and says who is now open.
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
  const ref = useRef<ComponentRef<typeof View>>(null);
  // Android's back button means Home here, not leaving the app.
  // Only while this screen is showing, and only when there is nothing to pop (e.g. the checklist
  // opened from here goes back to here first).
  const navigation = useNavigation();
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (navigation.canGoBack()) return false;
        onOpen();
        return true;
      });
      return () => sub.remove();
    }, [navigation, onOpen]),
  );
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
        accessibilityLabel="Back to home"
      >
        <Text style={styles.linkText}>Home</Text>
      </Pressable>
    </View>
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
});
