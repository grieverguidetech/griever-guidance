import { StyleSheet } from 'react-native';
import { screen } from '@testing-library/react-native';
import { v2 } from '@griever/tokens';

/**
 * Test helper: which tier a rendered button is drawn as, read from its frame.
 * Primary has the primary recipe's border, secondary the outline edge, tertiary no edge.
 */
export type RenderedTier = 'primary' | 'secondary' | 'tertiary' | 'unknown';

export function tierOfButton(name: string | RegExp): RenderedTier {
  const node = screen.getByRole('button', { name });
  const style = typeof node.props.style === 'function' ? node.props.style({ pressed: false }) : node.props.style;
  const frame = StyleSheet.flatten(style);
  if (frame.borderColor === v2.recipes.button.primary.border.color) {
    return 'primary';
  }
  if (frame.borderColor === v2.recipes.button.outline.border.color) {
    return 'secondary';
  }
  if (frame.borderColor === 'transparent') {
    return 'tertiary';
  }
  return 'unknown';
}
