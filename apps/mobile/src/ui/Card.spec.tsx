import { describe, expect, it } from '@jest/globals';
import { StyleSheet, Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { v2 } from '@griever/tokens';
import { Card, glassCard } from './Card';

describe('Card', () => {
  it('takes its look from the v2 card recipe', () => {
    render(
      <Card>
        <Text testID="inside">Inside</Text>
      </Card>,
    );
    const style = StyleSheet.flatten(screen.getByTestId('inside').parent?.parent?.props.style);
    const recipe = v2.recipes.card;
    expect(style.backgroundColor).toBe(recipe.fill);
    expect(style.borderWidth).toBe(recipe.border.width);
    expect(style.borderColor).toBe(recipe.border.color);
    expect(style.borderRadius).toBe(8);
    expect(style.boxShadow).toEqual(recipe.shadow.map((s) => ({ offsetX: s.x, offsetY: s.y, blurRadius: s.blur, color: s.color })));
  });

  it('exports the same look for the hub cards', () => {
    expect(glassCard.borderRadius).toBe(v2.recipes.card.radius);
  });
});
