import { Platform } from 'react-native';

/**
 * Web: asks phones for the URL keyboard. react-native-web turns `inputMode="url"` into `type="url"`,
 * which adds the browser's own invalid state on top of ours, so the attribute is set on the DOM node
 * instead and the field stays `type="text"`. Native uses `keyboardType`.
 */
export function applyUrlInputMode(node: unknown) {
  if (Platform.OS !== 'web' || !node) {
    return;
  }
  (node as { setAttribute: (name: string, value: string) => void }).setAttribute('inputmode', 'url');
}
