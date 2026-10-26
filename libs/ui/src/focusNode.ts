import { AccessibilityInfo, findNodeHandle, Platform } from 'react-native';
import type { ButtonNode } from './Button';

/** Moves focus to a button: the DOM on web, the screen reader's cursor on native. */
export function focusNode(node: ButtonNode | null) {
  if (!node) {
    return;
  }
  if (Platform.OS === 'web') {
    (node as unknown as { focus: () => void }).focus();
    return;
  }
  const handle = findNodeHandle(node);
  if (handle) {
    AccessibilityInfo.setAccessibilityFocus(handle);
  }
}
