import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';
import { Body } from './Text';

/**
 * A reason or error line. The polite status node is always rendered and only its text changes, so
 * screen readers announce the change. Also announced on iOS (it ignores live regions), but only when
 * the text changes after the screen has opened, so a reason that is there from the start is not read twice.
 */
export function Status({ id, message, tone = 'muted', queue = false }: { id: string; message?: string; tone?: 'muted' | 'danger'; queue?: boolean }) {
  const mounted = useRef(false);
  useEffect(() => {
    if (mounted.current && message && Platform.OS === 'ios') {
      // Queued, so it does not cut off the focus change that comes with it; older phones fall back.
      if (queue && typeof AccessibilityInfo.announceForAccessibilityWithOptions === 'function') {
        AccessibilityInfo.announceForAccessibilityWithOptions(message, { queue: true });
      } else {
        AccessibilityInfo.announceForAccessibility(message);
      }
    }
    mounted.current = true;
  }, [message]);
  return (
    <Body id={id} tone={tone} live>
      {message ?? ''}
    </Body>
  );
}
