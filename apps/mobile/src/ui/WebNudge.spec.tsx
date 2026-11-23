import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Animated, AccessibilityInfo, StyleSheet } from 'react-native';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react-native';
import { minTouchTarget, v2 } from '@griever/tokens';
import { useReduceMotion } from '../lib/useReduceMotion';
import { WebNudge } from './WebNudge';

const WORDS = {
  title: 'Write this on the web first',
  line: 'Open web.grieversguidance.com to write it.',
  button: 'Got it',
};

let passStarts: jest.Mock;

// The reduce-motion hook remembers its last answer, so settle it before the card renders.
async function givenReduceMotion(on: boolean) {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(on);
  jest
    .spyOn(AccessibilityInfo, 'addEventListener')
    .mockImplementation((() => ({ remove: () => undefined })) as never);
  const primer = renderHook(() => useReduceMotion());
  await act(async () => undefined);
  primer.unmount();
  passStarts.mockClear();
  (Animated.timing as jest.Mock).mockClear();
}

beforeEach(() => {
  passStarts = jest.fn();
  jest.spyOn(Animated, 'timing').mockImplementation((() => ({
    start: passStarts,
    stop: jest.fn(),
    reset: jest.fn(),
  })) as never);
});

afterEach(() => {
  jest.restoreAllMocks();
});

function renderNudge(onGotIt = jest.fn()) {
  return render(<WebNudge {...WORDS} onGotIt={onGotIt} />);
}

describe('WebNudge (mobile)', () => {
  it('reads the heading, the line and Got it in order', async () => {
    await givenReduceMotion(false);
    renderNudge();
    const names = screen
      .getAllByText(/./, { includeHiddenElements: false })
      .map((node) => node.props.children);
    expect(names).toEqual([WORDS.title, WORDS.line, WORDS.button]);
    expect(screen.getByRole('heading', { name: WORDS.title })).toBeTruthy();
    expect(screen.getByRole('button', { name: WORDS.button })).toBeTruthy();
  });

  it('does not make the card one accessible block', async () => {
    await givenReduceMotion(false);
    renderNudge();
    const card = screen.getByTestId('web-nudge');
    expect(card.props.accessible).not.toBe(true);
    expect(card.props.accessibilityLabel).toBeUndefined();
  });

  it('hides the swirl, the speckles and the orb from screen readers and touches', async () => {
    await givenReduceMotion(false);
    renderNudge();
    for (const id of ['linear-swirl-decoration', 'nudge-speckles', 'nudge-orb']) {
      const node = screen.getByTestId(id, { includeHiddenElements: true });
      expect(node.props.accessibilityElementsHidden).toBe(true);
      expect(node.props.importantForAccessibility).toBe('no-hide-descendants');
      expect(node.props.pointerEvents).toBe('none');
    }
  });

  it('draws the card from the nudge recipe: border, radius, both shadows, text colour', async () => {
    await givenReduceMotion(false);
    renderNudge();
    const recipe = v2.recipes.nudge;
    const style = StyleSheet.flatten(screen.getByTestId('web-nudge').props.style);
    expect(style.borderColor).toBe(recipe.border.color);
    expect(style.borderWidth).toBe(recipe.border.width);
    expect(style.borderRadius).toBe(recipe.radius);
    expect(style.boxShadow).toEqual(
      recipe.shadow.map((x) => ({ offsetX: x.x, offsetY: x.y, blurRadius: x.blur, color: x.color })),
    );
    const line = StyleSheet.flatten(screen.getByText(WORDS.line).props.style);
    expect(line.color).toBe(recipe.text.color);
    expect(line.fontSize).toBe(recipe.text.size);
  });

  it('keeps Got it at least 44 points and calls onGotIt', async () => {
    await givenReduceMotion(false);
    const onGotIt = jest.fn();
    renderNudge(onGotIt);
    const button = screen.getByRole('button', { name: WORDS.button });
    expect(StyleSheet.flatten(button.props.style).minHeight).toBeGreaterThanOrEqual(minTouchTarget);
    expect(minTouchTarget).toBeGreaterThanOrEqual(44);
    fireEvent.press(button);
    expect(onGotIt).toHaveBeenCalledTimes(1);
  });

  async function layOutCard(view: ReturnType<typeof render>) {
    const outer = view.getByTestId('linear-swirl-decoration', { includeHiddenElements: true }).parent;
    await act(async () => {
      fireEvent(outer as never, 'layout', { nativeEvent: { layout: { width: 300, height: 120 } } });
    });
  }

  it('runs the swirl and the orb when Reduce Motion is off (control)', async () => {
    await givenReduceMotion(false);
    await layOutCard(renderNudge());
    expect(Animated.timing).toHaveBeenCalledTimes(2);
    expect(passStarts).toHaveBeenCalledTimes(2);
  });

  it('runs no motion under Reduce Motion', async () => {
    await givenReduceMotion(true);
    await layOutCard(renderNudge());
    expect(Animated.timing).not.toHaveBeenCalled();
    expect(passStarts).not.toHaveBeenCalled();
  });
});
