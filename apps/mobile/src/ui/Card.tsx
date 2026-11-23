import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { spacing, v2 } from '@griever/tokens';

export interface CardProps {
  children: ReactNode;
  /** The one card that holds the next step: a heavier accent border. */
  selected?: boolean;
  testID?: string;
}

const recipe = v2.recipes.card;

/** The glass look from the v2 card recipe: fill, 1 px edge, soft shadow, 8 pt corners. Hub cards reuse it. */
/** The recipe shadow in RN's boxShadow form. */
export const glassShadow = recipe.shadow.map((s) => ({ offsetX: s.x, offsetY: s.y, blurRadius: s.blur, color: s.color }));

export const glassCard = {
  backgroundColor: recipe.fill,
  borderWidth: recipe.border.width,
  borderColor: recipe.border.color,
  borderRadius: recipe.radius,
  boxShadow: glassShadow,
} as const;

/** A grouped block of content. Not a button; put controls inside it. */
export function Card({ children, selected = false, testID }: CardProps) {
  return <View testID={testID} style={[styles.card, selected && styles.selected]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    ...glassCard,
    gap: spacing[2],
    padding: spacing[3],
  },
  selected: { borderWidth: 2, borderColor: v2.roles.link },
});
