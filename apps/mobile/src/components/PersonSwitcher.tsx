import { useCallback, useEffect } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { BackHandler } from 'react-native';
import type { Session } from '@griever/hooks';
import { announce } from './authForm';

const UNNAMED = 'Someone new';

export const personLabel = (s: Session) => s.personName.trim() || UNNAMED;

/**
 * Draws nothing (#364 removed the "Writing about... / Home" bar). It stays on every step for Android's
 * back button, and to say who is now open when the person has just come from Home.
 */
export function PersonBar({
  active,
  onOpen,
  arrived,
  onArrived,
  onHardwareBack,
}: {
  active: Session;
  onOpen: () => void;
  /** What Android's back button does here, when it is not Home (for example, back to the hub). */
  onHardwareBack?: () => void;
  arrived: boolean;
  onArrived: () => void;
}) {
  // Android's back button means Home here, not leaving the app.
  // Only while this screen is showing, and only when there is nothing to pop (e.g. the checklist
  // opened from here goes back to here first).
  const navigation = useNavigation();
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (navigation.canGoBack()) return false;
        (onHardwareBack ?? onOpen)();
        return true;
      });
      return () => sub.remove();
    }, [navigation, onOpen, onHardwareBack]),
  );
  // No bar is drawn (#364): each step has its own Back. This still says who is open when the person arrives.
  useEffect(() => {
    if (!arrived) {
      return;
    }
    announce(`Now writing about ${personLabel(active)}`);
    onArrived();
  }, [arrived, active, onArrived]);
  return null;
}
