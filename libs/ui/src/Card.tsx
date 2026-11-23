import type { ReactNode } from 'react';
import { Platform, View } from 'react-native';
import type { ViewStyle } from 'react-native';
import { colors, radius, spacing } from '@griever/tokens';

export interface CardProps {
  children: ReactNode;
  /** The one card that holds the next step: a heavier accent border. */
  selected?: boolean;
}

/** Web reads the generated v2 glass vars; native keeps its tokens. (jsdom drops var() values, so tests call this.) */
export function webGlassStyle(): ViewStyle {
  // react-native-web passes strings through; the react-native types only allow numbers here.
  return {
    backgroundColor: 'var(--color-v2-card-fill)',
    borderColor: 'var(--color-v2-card-border)',
    borderRadius: 'var(--v2-radius)',
    boxShadow: 'var(--v2-card-shadow)',
  } as unknown as ViewStyle;
}

/** The card's style, as plain objects so a test can read the widths. The selected ring wins over the glass edge. */
export function cardStyle(selected: boolean, web: boolean): ViewStyle[] {
  return [baseCard, ...(web ? [webGlassStyle()] : []), ...(selected ? [selectedCard] : [])];
}

/** A grouped block of content. Not a button; put controls inside it. */
export function Card({ children, selected = false }: CardProps) {
  return <View style={cardStyle(selected, Platform.OS === 'web')}>{children}</View>;
}

const baseCard: ViewStyle = {
  gap: spacing[2],
  padding: spacing[3],
  backgroundColor: colors.surface,
  borderRadius: radius.md,
  borderWidth: 1,
  borderColor: colors['neutral-300'],
};

const selectedCard: ViewStyle = { borderWidth: 2, borderColor: colors.accent };
