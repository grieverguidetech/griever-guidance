import { Platform } from 'react-native';

/** The two DOM methods used below, so this lib needs no DOM typings. */
interface DomAttributes {
  setAttribute: (name: string, value: string) => void;
  removeAttribute: (name: string) => void;
}

/**
 * react-native-web's Pressable drops `aria-disabled` and only supports a real `disabled`, which
 * removes the element from the tab order. For an unavailable-but-focusable control the attribute
 * is set on the DOM node from a ref callback. Native uses the accessibility state instead.
 */
export function applyAriaDisabled(node: unknown, ariaDisabled: boolean) {
  if (Platform.OS !== 'web' || !node) {
    return;
  }
  const element = node as DomAttributes;
  if (ariaDisabled) {
    element.setAttribute('aria-disabled', 'true');
  } else {
    element.removeAttribute('aria-disabled');
  }
}
