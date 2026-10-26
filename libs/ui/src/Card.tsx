import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, radius, spacing } from '@griever/tokens';

export interface CardProps {
  children: ReactNode;
  /** The one card that holds the next step: a heavier accent border. */
  selected?: boolean;
}

/** A grouped block of content. Not a button; put controls inside it. */
export function Card({ children, selected = false }: CardProps) {
  return <View style={[styles.card, selected && styles.selected]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    gap: spacing[2],
    padding: spacing[3],
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors['neutral-300'],
  },
  selected: { borderWidth: 2, borderColor: colors.accent },
});
