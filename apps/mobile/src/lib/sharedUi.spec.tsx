import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { v2 } from '@griever/tokens';
import { Button, Eyebrow, Heading, SerifReadyContext } from '../ui';

/** Mobile's own UI (apps/mobile/src/ui) on the native renderer. */
describe('mobile UI on native', () => {
  it('renders a heading as a heading', () => {
    render(<Heading level={1}>One thing at a time.</Heading>);
    expect(screen.getByRole('heading', { name: 'One thing at a time.' })).toBeTruthy();
  });

  it('renders a button that calls onPress', () => {
    const onPress = jest.fn();
    render(<Button label="Start" onPress={onPress} />);
    fireEvent.press(screen.getByRole('button', { name: 'Start' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('says why an unavailable button is dimmed, and still calls onPress', () => {
    const onPress = jest.fn();
    render(<Button label="Share the service" onPress={onPress} ariaDisabled hint="Included with the full plan" />);
    const button = screen.getByRole('button', { name: 'Share the service' });
    // Not an accessibility disabled state: on native that swallows the tap (#292).
    expect(button.props.accessibilityState?.disabled).not.toBe(true);
    expect(button.props.accessibilityHint).toBe('Included with the full plan');
    fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('uses the system font until the serif has loaded, then Fraunces 300 in the heading colour', () => {
    const family = () => StyleSheet.flatten(screen.getByRole('heading').props.style).fontFamily;
    const { rerender } = render(
      <SerifReadyContext.Provider value={false}>
        <Heading level={1}>Title</Heading>
      </SerifReadyContext.Provider>,
    );
    expect(family()).toBeUndefined();
    rerender(
      <SerifReadyContext.Provider value>
        <Heading level={1}>Title</Heading>
      </SerifReadyContext.Provider>,
    );
    expect(family()).toBe('Fraunces_300Light');
    expect(StyleSheet.flatten(screen.getByRole('heading').props.style).color).toBe(v2.roles.heading.color);
  });
});

describe('Heading weight on native', () => {
  it.each([[2], [3]] as const)('level %i uses Fraunces 400, only level 1 is Fraunces 300', (level) => {
    render(<Heading level={level}>Title</Heading>);
    expect(StyleSheet.flatten(screen.getByRole('heading').props.style).fontFamily).toBe('Fraunces_400Regular');
  });
});

describe('Eyebrow on native', () => {
  it('is 13px, uppercase, 0.08em tracking, in the eyebrow role colour', () => {
    render(<Eyebrow>For Margaret</Eyebrow>);
    const style = StyleSheet.flatten(screen.getByText('For Margaret').props.style);
    expect(style.fontSize).toBe(13);
    expect(style.textTransform).toBe('uppercase');
    expect(style.letterSpacing).toBeCloseTo(1.04);
    expect(style.color).toBe(v2.roles.eyebrow.color);
  });
});
