import { render, screen } from '@testing-library/react';
import { StyleSheet } from 'react-native';
import { colors } from '@griever/tokens';
import { Card, cardStyle, webGlassStyle } from './Card';

describe('Card', () => {
  it('renders its children', () => {
    render(
      <Card>
        <span>Next step</span>
      </Card>,
    );
    expect(screen.getByText('Next step')).toBeInTheDocument();
  });

  it('uses the generated v2 glass vars on web', () => {
    expect(webGlassStyle()).toEqual({
      backgroundColor: 'var(--color-v2-card-fill)',
      borderColor: 'var(--color-v2-card-border)',
      borderRadius: 'var(--v2-radius)',
      boxShadow: 'var(--v2-card-shadow)',
    });
  });

  it('keeps a 1px edge when not selected, and the glass vars win on web', () => {
    const style = StyleSheet.flatten(cardStyle(false, true)) ?? {};
    expect(style.borderWidth).toBe(1);
    expect(style.backgroundColor).toBe('var(--color-v2-card-fill)');
  });

  it('keeps a 2px ring when selected, on web and native', () => {
    for (const web of [true, false]) {
      const style = StyleSheet.flatten(cardStyle(true, web)) ?? {};
      expect(style.borderWidth).toBe(2);
      expect(style.borderColor).toBe(colors.accent);
    }
  });

  it('keeps the native look off the glass vars', () => {
    const style = StyleSheet.flatten(cardStyle(false, false)) ?? {};
    expect(style.backgroundColor).toBe(colors.surface);
    expect(style.borderColor).toBe(colors['neutral-300']);
  });
});
