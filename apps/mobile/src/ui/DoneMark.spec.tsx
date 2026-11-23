import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AccessibilityInfo, Animated } from 'react-native';
import { act, render, renderHook, screen } from '@testing-library/react-native';
import { Path } from 'react-native-svg';
import { v2 } from '@griever/tokens';
import { useReduceMotion } from '../lib/useReduceMotion';
import { DoneMark } from './DoneMark';

const recipe = v2.recipes.doneMark;

async function givenReduceMotion(on: boolean) {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(on);
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation((() => ({
    remove: () => undefined,
  })) as never);
  // The hook remembers its last answer, so settle it before the mark renders.
  const primer = renderHook(() => useReduceMotion());
  await act(async () => undefined);
  primer.unmount();
  (Animated.timing as jest.Mock).mockClear();
}

const swirl = () => screen.queryByTestId('done-mark-swirl', { includeHiddenElements: true });
const ring = () => screen.queryByTestId('done-mark-ring', { includeHiddenElements: true });

describe('DoneMark (#977)', () => {
  beforeEach(() => {
    jest.spyOn(Animated, 'timing').mockImplementation((() => ({
      start: jest.fn(),
      stop: jest.fn(),
      reset: jest.fn(),
    })) as never);
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows the conic swirl at the recipe size when checked, and no ring', async () => {
    await givenReduceMotion(false);
    const view = render(<DoneMark checked />);
    expect(swirl()).toBeTruthy();
    expect(ring()).toBeNull();
    expect(swirl()?.props.style).toMatchObject({ width: recipe.size, height: recipe.size });
    expect(recipe.size).toBe(16);
    expect(view.UNSAFE_getAllByType(Path).length).toBeGreaterThan(0);
  });

  it('shows a 16px ring from the recipe when unchecked, and no swirl', async () => {
    await givenReduceMotion(false);
    render(<DoneMark checked={false} />);
    expect(swirl()).toBeNull();
    expect(ring()?.props.style).toMatchObject({
      width: recipe.size,
      height: recipe.size,
      borderWidth: recipe.openWidth,
      borderColor: recipe.openRing,
    });
    expect(recipe.openWidth).toBe(1.5);
  });

  it.each([true, false])('is hidden from screen readers and ignores touches (checked %s)', async (checked) => {
    await givenReduceMotion(false);
    render(<DoneMark checked={checked} />);
    const mark = (swirl() ?? ring())?.parent?.parent;
    expect(mark?.props.accessibilityElementsHidden).toBe(true);
    expect(mark?.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(mark?.props.pointerEvents).toBe('none');
    expect(screen.queryByTestId('done-mark-swirl')).toBeNull();
  });

  it('turns once when motion is allowed', async () => {
    await givenReduceMotion(false);
    render(<DoneMark checked />);
    expect(Animated.timing).toHaveBeenCalledTimes(1);
  });

  it('does not move under Reduce Motion', async () => {
    await givenReduceMotion(true);
    render(<DoneMark checked />);
    expect(Animated.timing).not.toHaveBeenCalled();
  });
});
