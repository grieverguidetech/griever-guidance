import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ActivityIndicator, StyleSheet } from 'react-native';
import { minTouchTarget, v2 } from '@griever/tokens';
import { Button } from './Button';
import { LinearSwirl } from './Swirl';

describe('Button (mobile)', () => {
  it('while busy shows the busy words and a spinner, and reads as busy and unavailable', () => {
    render(<Button label="Save" busyLabel="Saving…" onPress={jest.fn()} busy />);
    expect(screen.getByText('Saving…')).toBeTruthy();
    expect(screen.queryByText('Save')).toBeNull();
    expect(screen.UNSAFE_getAllByType(ActivityIndicator)).toHaveLength(1);
    const button = screen.getByRole('button', { name: 'Saving…' });
    expect(button.props.accessibilityState).toMatchObject({ busy: true, disabled: true });
  });

  it('without busy it has no spinner and no busy state', () => {
    render(<Button label="Save" busyLabel="Saving…" onPress={jest.fn()} />);
    expect(screen.UNSAFE_queryAllByType(ActivityIndicator)).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Save' }).props.accessibilityState?.busy).toBeFalsy();
  });

  it('reads open or closed when expanded is given, and says nothing otherwise', () => {
    const { rerender } = render(<Button label="Edit" onPress={jest.fn()} expanded={false} />);
    expect(screen.getByRole('button', { name: 'Edit' }).props.accessibilityState).toMatchObject({ expanded: false });
    rerender(<Button label="Edit" onPress={jest.fn()} expanded />);
    expect(screen.getByRole('button', { name: 'Edit' }).props.accessibilityState).toMatchObject({ expanded: true });
    rerender(<Button label="Edit" onPress={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Edit' }).props.accessibilityState?.expanded).toBeUndefined();
  });

  it('calls onPress when pressed', () => {
    const onPress = jest.fn();
    render(<Button label="Save" onPress={onPress} />);
    fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('keeps its own minimum height unless minHeight is given', () => {
    const heightOf = (node: { props: { style?: unknown } }) =>
      StyleSheet.flatten(typeof node.props.style === 'function' ? node.props.style({ pressed: false }) : node.props.style).minHeight;
    const { rerender } = render(<Button label="Save" onPress={jest.fn()} />);
    expect(heightOf(screen.getByRole('button', { name: 'Save' }))).toBe(minTouchTarget);
    rerender(<Button label="Save" onPress={jest.fn()} minHeight={52} />);
    expect(heightOf(screen.getByRole('button', { name: 'Save' }))).toBe(52);
  });

  describe('swirl variants', () => {
    const recipes = { primary: v2.recipes.button.primary, secondary: v2.recipes.button.secondary };
    const flat = (node: { props: { style?: unknown } }) =>
      StyleSheet.flatten(typeof node.props.style === 'function' ? node.props.style({ pressed: false }) : node.props.style);

    it.each(['primary', 'secondary'] as const)('%s renders a LinearSwirl with the recipe stops and the recipe text', (variant) => {
      const recipe = recipes[variant];
      render(<Button label="Save" variant={variant} onPress={jest.fn()} />);
      const swirl = screen.UNSAFE_getByType(LinearSwirl);
      expect(swirl.props.stops).toEqual([...recipe.swirl.stops]);
      expect(swirl.props.angle).toBe(recipe.swirl.angle);
      expect(swirl.props.driftMs).toBe(recipe.driftMs);
      const label = StyleSheet.flatten(screen.getByText('Save').props.style);
      expect(label.color).toBe(recipe.text.color);
      expect(label.fontWeight).toBe(String(recipe.text.weight));
      const frame = flat(screen.getByRole('button', { name: 'Save' }));
      expect(frame).toMatchObject({ borderWidth: recipe.border.width, borderColor: recipe.border.color, borderRadius: 8 });
    });

    it('primary is medium weight with a 1px border, secondary is regular with 1.5px', () => {
      expect(recipes.primary.text.weight).toBe(500);
      expect(recipes.primary.border.width).toBe(1);
      expect(recipes.secondary.text.weight).toBe(400);
      expect(recipes.secondary.border.width).toBe(1.5);
    });

    it('keeps the label readable by role, and only the decoration is hidden', () => {
      render(<Button label="Save" onPress={jest.fn()} />);
      expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
      expect(screen.getByText('Save')).toBeTruthy();
      expect(screen.getByTestId('linear-swirl-decoration', { includeHiddenElements: true }).props.accessibilityElementsHidden).toBe(true);
    });

    it('other variants have no swirl', () => {
      render(<Button label="Save" variant="tertiary" onPress={jest.fn()} />);
      expect(screen.UNSAFE_queryAllByType(LinearSwirl)).toHaveLength(0);
    });

    it('busy uses the recipe text colour for the spinner and keeps the swirl', () => {
      render(<Button label="Save" busyLabel="Saving…" onPress={jest.fn()} busy />);
      expect(screen.UNSAFE_getByType(ActivityIndicator).props.color).toBe(recipes.primary.text.color);
      expect(screen.UNSAFE_getAllByType(LinearSwirl)).toHaveLength(1);
      expect(screen.getByRole('button', { name: 'Saving…' })).toBeTruthy();
    });

    it('secondary busy spinner uses the secondary text colour', () => {
      render(<Button label="Save" variant="secondary" onPress={jest.fn()} busy />);
      expect(screen.UNSAFE_getByType(ActivityIndicator).props.color).toBe(recipes.secondary.text.color);
    });

    it('aria-disabled primary has no swirl, a solid ink fill and page-coloured text', () => {
      render(<Button label="Save" onPress={jest.fn()} ariaDisabled />);
      expect(screen.UNSAFE_queryAllByType(LinearSwirl)).toHaveLength(0);
      expect(flat(screen.getByRole('button', { name: 'Save' })).backgroundColor).toBe(v2.roles.ink);
      expect(StyleSheet.flatten(screen.getByText('Save').props.style).color).toBe(v2.roles.page.color);
    });

    it('aria-disabled primary still calls onPress, so the caller can explain', () => {
      const onPress = jest.fn();
      render(<Button label="Save" onPress={onPress} ariaDisabled />);
      fireEvent.press(screen.getByRole('button', { name: 'Save' }));
      expect(onPress).toHaveBeenCalledTimes(1);
    });

    it.each(['primary', 'secondary'] as const)('%s keeps a touch target of at least 44', (variant) => {
      render(<Button label="Save" variant={variant} onPress={jest.fn()} />);
      const frame = flat(screen.getByRole('button', { name: 'Save' }));
      expect(frame.minHeight).toBeGreaterThanOrEqual(44);
      expect(frame.minWidth).toBeGreaterThanOrEqual(44);
    });
  });
});
