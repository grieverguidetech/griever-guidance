import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react-native';
import { AccessibilityInfo, ActivityIndicator, Animated, StyleSheet } from 'react-native';
import { minTouchTarget, v2 } from '@griever/tokens';
import { Button, recipeShadow } from './Button';
import { useReduceMotion } from '../lib/useReduceMotion';
import { LinearSwirl } from './Swirl';

describe('Button (mobile)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

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

  // The secondary tier reads the outline recipe; the tertiary tier reads the tertiary recipe.
  describe('three tiers', () => {
    const outline = v2.recipes.button.outline;
    const tertiary = v2.recipes.button.tertiary;
    const flatStyle = (node: { props: { style?: unknown } }) =>
      StyleSheet.flatten(typeof node.props.style === 'function' ? node.props.style({ pressed: false }) : node.props.style);

    it('secondary is an outline: no swirl, no shadow, a thin link edge, link text, radius 8', () => {
      render(<Button label="Back" variant="secondary" onPress={jest.fn()} />);
      expect(screen.UNSAFE_queryAllByType(LinearSwirl)).toHaveLength(0);
      const frame = flatStyle(screen.getByRole('button', { name: 'Back' }));
      expect(frame).toMatchObject({ borderWidth: 1, borderColor: v2.roles.link, borderRadius: 8 });
      expect(frame.boxShadow).toBeUndefined();
      expect(frame.backgroundColor).toBeUndefined();
      expect(StyleSheet.flatten(screen.getByText('Back').props.style).color).toBe(outline.text.color);
      expect(outline.text.color).toBe(v2.roles.link);
      expect(outline.border.color).toBe(v2.roles.link);
    });

    it('tertiary is underlined link text with no edge, no fill and no shadow', () => {
      render(<Button label="Skip" variant="tertiary" onPress={jest.fn()} />);
      expect(screen.UNSAFE_queryAllByType(LinearSwirl)).toHaveLength(0);
      const label = StyleSheet.flatten(screen.getByText('Skip').props.style);
      expect(label.color).toBe(tertiary.text.color);
      expect(label.textDecorationLine).toBe('underline');
      const frame = flatStyle(screen.getByRole('button', { name: 'Skip' }));
      expect(frame.borderColor).toBe('transparent');
      expect(frame.backgroundColor).toBeUndefined();
      expect(frame.boxShadow).toBeUndefined();
    });

    it('a pressed secondary or tertiary shows the wash, not a fade', async () => {
      for (const variant of ['secondary', 'tertiary'] as const) {
        const { unmount } = render(<Button label="Go" variant={variant} onPress={jest.fn()} />);
        await act(async () => {
          fireEvent(screen.getByRole('button', { name: 'Go' }), 'responderGrant', { nativeEvent: { touches: [], changedTouches: [], target: 1 }, currentTarget: { measure: () => undefined }, persist: () => undefined });
        });
        const frame = flatStyle(screen.getByRole('button', { name: 'Go' }));
        expect({ variant, background: frame.backgroundColor, opacity: frame.opacity }).toEqual({
          variant,
          background: v2.roles.wash,
          opacity: undefined,
        });
        unmount();
      }
    });

    it('an unavailable tertiary has no edge and a muted label', () => {
      render(<Button label="Skip" variant="tertiary" onPress={jest.fn()} ariaDisabled />);
      expect(StyleSheet.flatten(screen.getByText('Skip').props.style).color).toBe(v2.roles.muted);
      expect(flatStyle(screen.getByRole('button', { name: 'Skip' })).borderStyle).toBeUndefined();
    });
  });

  describe('primary and shared behaviour', () => {
    const recipes = { primary: v2.recipes.button.primary, secondary: v2.recipes.button.outline };
    const flat = (node: { props: { style?: unknown } }) =>
      StyleSheet.flatten(typeof node.props.style === 'function' ? node.props.style({ pressed: false }) : node.props.style);

    it('primary renders a LinearSwirl with the recipe stops and the recipe text', () => {
      const recipe = recipes.primary;
      render(<Button label="Save" variant="primary" onPress={jest.fn()} />);
      const swirl = screen.UNSAFE_getByType(LinearSwirl);
      expect(swirl.props.stops).toEqual([...recipe.swirl.stops]);
      expect(swirl.props.angle).toBe(recipe.swirl.angle);
      expect(swirl.props.driftMs).toBe(recipe.driftMs);
      const label = StyleSheet.flatten(screen.getByText('Save').props.style);
      expect(label.color).toBe(recipe.text.color);
      // Native picks the weight by family name: Nunito Sans 600.
      expect(label.fontFamily).toBe('NunitoSans_600SemiBold');
      expect(label.fontWeight).toBeUndefined();
      const frame = flat(screen.getByRole('button', { name: 'Save' }));
      expect(frame).toMatchObject({ borderWidth: recipe.border.width, borderColor: recipe.border.color, borderRadius: 8 });
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

    it('aria-disabled secondary is a flat page fill with a dashed recipe border and the recipe text colour', () => {
      render(<Button label="Save" variant="secondary" onPress={jest.fn()} ariaDisabled />);
      expect(screen.UNSAFE_queryAllByType(LinearSwirl)).toHaveLength(0);
      const frame = flat(screen.getByRole('button', { name: 'Save' }));
      expect(frame).toMatchObject({
        backgroundColor: v2.roles.page.color,
        borderStyle: 'dashed',
        borderWidth: 1,
        borderColor: recipes.secondary.border.color,
      });
      expect(StyleSheet.flatten(screen.getByText('Save').props.style).color).toBe(recipes.secondary.text.color);
    });

    it('maps the whole recipe shadow list to one exact boxShadow string', () => {
      expect(recipeShadow(recipes.primary)).toBe('0px 2px 12px rgba(150,90,30,0.12)');
      render(<Button label="Save" onPress={jest.fn()} />);
      expect(flat(screen.getByRole('button', { name: 'Save' })).boxShadow).toBe('0px 2px 12px rgba(150,90,30,0.12)');
    });

    it('the swirl clips to the frame radius minus the border, so no fill shows at the corners', () => {
      render(<Button label="Save" variant="primary" onPress={jest.fn()} />);
      const inner = screen.UNSAFE_getByType(LinearSwirl).props.style;
      expect(StyleSheet.flatten(inner).borderRadius).toBe(recipes.primary.radius - recipes.primary.border.width);
    });

    // Pressed dims the whole button. Blend the label and each swirl stop over the page and check 4.5:1.
    const channel = (hex: string, at: number) => parseInt(hex.slice(1 + at * 2, 3 + at * 2), 16);
    const blend = (fg: string, bg: string, a: number) =>
      [0, 1, 2].map((k) => channel(fg, k) * a + channel(bg, k) * (1 - a));
    const luminance = (rgb: number[]) => {
      const [r, g, b] = rgb.map((v) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratio = (a: number[], b: number[]) => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };

    it('primary label stays at 4.5:1 or more while pressed', async () => {
      const recipe = recipes.primary;
      render(<Button label="Save" variant="primary" onPress={jest.fn()} />);
      const node = screen.getByRole('button', { name: 'Save' });
      await act(async () => {
        fireEvent(node, 'responderGrant', { nativeEvent: { touches: [], changedTouches: [], target: 1 }, currentTarget: { measure: () => undefined }, persist: () => undefined });
      });
      const opacity = flat(screen.getByRole('button', { name: 'Save' })).opacity as number;
      expect(opacity).toBeGreaterThan(0.7);
      const page = v2.roles.page.color;
      const text = blend(recipe.text.color, page, opacity);
      for (const stop of recipe.swirl.stops) {
        const fill = blend(stop, page, opacity);
        expect(ratio(text, fill)).toBeGreaterThanOrEqual(4.5);
      }
    });

    describe('motion', () => {
      async function givenReduceMotion(on: boolean) {
        jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(on);
        jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation((() => ({ remove: () => undefined })) as never);
        // The hook remembers the last answer, so settle it first.
        const primer = renderHook(() => useReduceMotion());
        await act(async () => undefined);
        primer.unmount();
      }
      async function layOutButton() {
        jest.spyOn(Animated, 'timing').mockImplementation((() => ({ start: jest.fn(), stop: jest.fn(), reset: jest.fn() })) as never);
        const view = render(<Button label="Save" onPress={jest.fn()} />);
        const outer = view.getByTestId('linear-swirl-decoration', { includeHiddenElements: true }).parent;
        await act(async () => {
          fireEvent(outer as never, 'layout', { nativeEvent: { layout: { width: 200, height: 48 } } });
        });
      }

      it('with Reduce Motion on, the swirl starts no animation', async () => {
        await givenReduceMotion(true);
        await layOutButton();
        expect(Animated.timing).not.toHaveBeenCalled();
      });

      it('with Reduce Motion off, the swirl starts one pass (so the test above is meaningful)', async () => {
        await givenReduceMotion(false);
        await layOutButton();
        expect(Animated.timing).toHaveBeenCalledTimes(1);
      });
    });

    it('aria-disabled primary is quiet: page fill, no swirl, no shadow, a dashed recipe edge and the recipe label colour', () => {
      render(<Button label="Save" onPress={jest.fn()} ariaDisabled />);
      expect(screen.UNSAFE_queryAllByType(LinearSwirl)).toHaveLength(0);
      const frame = flat(screen.getByRole('button', { name: 'Save' }));
      expect(frame).toMatchObject({
        backgroundColor: v2.roles.page.color,
        borderStyle: 'dashed',
        borderWidth: recipes.primary.border.width,
        borderColor: recipes.primary.border.color,
        boxShadow: 'none',
      });
      expect(StyleSheet.flatten(screen.getByText('Save').props.style).color).toBe(recipes.primary.text.color);
    });

    it('aria-disabled primary edge is 3:1 and label 4.5:1 on the page and both glows', () => {
      const hex = (value: string) => [0, 1, 2].map((k) => channel(value, k));
      const grounds = [v2.roles.page.color, v2.roles.page.glows.topRight, v2.roles.page.glows.bottomLeft];
      for (const ground of grounds) {
        expect(ratio(hex(recipes.primary.border.color), hex(ground))).toBeGreaterThanOrEqual(3);
        expect(ratio(hex(recipes.primary.text.color), hex(ground))).toBeGreaterThanOrEqual(4.5);
      }
    });

    // Secondary (outline) and tertiary sit on the page, both glows and glass cards (the glass fill blended over each).
    const glassOver = (ground: string) => {
      const match = /rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/.exec(v2.recipes.card.fill);
      const [r, g, b, a] = [Number(match?.[1]), Number(match?.[2]), Number(match?.[3]), Number(match?.[4])];
      return [r, g, b].map((v, k) => v * a + channel(ground, k) * (1 - a));
    };
    const hexRgb = (value: string) => [0, 1, 2].map((k) => channel(value, k));
    const bases = [v2.roles.page.color, v2.roles.page.glows.topRight, v2.roles.page.glows.bottomLeft];
    const grounds = [
      ...bases.map((ground) => ({ name: ground, rgb: hexRgb(ground) })),
      ...bases.map((ground) => ({ name: `glass over ${ground}`, rgb: glassOver(ground) })),
    ];

    it('secondary outline edge is 3:1 and label 4.5:1 on the page, both glows and glass', () => {
      for (const ground of grounds) {
        expect({ ground: ground.name, ok: ratio(hexRgb(recipes.secondary.border.color), ground.rgb) >= 3 }).toEqual({ ground: ground.name, ok: true });
        expect({ ground: ground.name, ok: ratio(hexRgb(recipes.secondary.text.color), ground.rgb) >= 4.5 }).toEqual({ ground: ground.name, ok: true });
      }
    });

    // The pressed wash is an opaque fill, so one ratio covers every ground.
    it('secondary label stays at 4.5:1 on the pressed wash', () => {
      expect(ratio(hexRgb(recipes.secondary.text.color), hexRgb(v2.roles.wash))).toBeGreaterThanOrEqual(4.5);
    });

    it('tertiary label is 4.5:1 on the page, both glows, glass and the pressed wash', () => {
      for (const ground of grounds) {
        expect({ ground: ground.name, ok: ratio(hexRgb(v2.recipes.button.tertiary.text.color), ground.rgb) >= 4.5 }).toEqual({ ground: ground.name, ok: true });
      }
      expect(ratio(hexRgb(v2.recipes.button.tertiary.text.color), hexRgb(v2.roles.wash))).toBeGreaterThanOrEqual(4.5);
    });

    it('aria-disabled primary keeps its accessibilityState: not disabled by default, disabled when announceDisabled is set', () => {
      const { rerender } = render(<Button label="Save" onPress={jest.fn()} ariaDisabled />);
      expect(screen.getByRole('button', { name: 'Save' }).props.accessibilityState?.disabled).toBeFalsy();
      rerender(<Button label="Save" onPress={jest.fn()} ariaDisabled announceDisabled />);
      expect(screen.getByRole('button', { name: 'Save' }).props.accessibilityState).toMatchObject({ disabled: true });
    });

    it.each(['primary', 'secondary'] as const)('aria-disabled %s does not fade while pressed', async (variant) => {
      render(<Button label="Save" variant={variant} onPress={jest.fn()} ariaDisabled />);
      const before = flat(screen.getByRole('button', { name: 'Save' }));
      await act(async () => {
        fireEvent(screen.getByRole('button', { name: 'Save' }), 'responderGrant', { nativeEvent: { touches: [], changedTouches: [], target: 1 }, currentTarget: { measure: () => undefined }, persist: () => undefined });
      });
      const after = flat(screen.getByRole('button', { name: 'Save' }));
      expect(after.opacity).toBeUndefined();
      expect(after).toEqual(before);
    });

    it('busy aria-disabled primary spinner uses the primary recipe label colour', () => {
      render(<Button label="Save" busyLabel="Saving…" onPress={jest.fn()} busy ariaDisabled />);
      expect(screen.UNSAFE_getByType(ActivityIndicator).props.color).toBe(recipes.primary.text.color);
    });

    it('aria-disabled primary still calls onPress, so the caller can explain', () => {
      const onPress = jest.fn();
      render(<Button label="Save" onPress={onPress} ariaDisabled />);
      fireEvent.press(screen.getByRole('button', { name: 'Save' }));
      expect(onPress).toHaveBeenCalledTimes(1);
    });

    it.each(['primary', 'secondary', 'tertiary'] as const)('%s keeps a touch target of at least 44', (variant) => {
      render(<Button label="Save" variant={variant} onPress={jest.fn()} />);
      const frame = flat(screen.getByRole('button', { name: 'Save' }));
      expect(frame.minHeight).toBeGreaterThanOrEqual(44);
      expect(frame.minWidth).toBeGreaterThanOrEqual(44);
    });
  });
});
