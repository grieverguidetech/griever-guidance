import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { AccessibilityInfo, Animated, AppState, StyleSheet, Text, View } from 'react-native';
import { act, render, screen } from '@testing-library/react-native';
import { v2 } from '@griever/tokens';
import { FadeIn, ScreenFrame } from './ScreenFrame';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

afterEach(() => {
  jest.restoreAllMocks();
});

const setup = (reduceMotion: boolean, screenReader: boolean) => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(reduceMotion);
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(screenReader);
  return jest.spyOn(Animated, 'timing');
};

const show = async () => {
  render(
    <FadeIn>
      <Text>Hello</Text>
    </FadeIn>,
  );
  await act(async () => undefined);
};

const opacity = () => {
  const style = screen.toJSON() && (screen.toJSON() as { props: { style: { opacity?: number } | { opacity?: number }[] } }).props.style;
  const flat = Array.isArray(style) ? Object.assign({}, ...style) : style;
  return flat?.opacity;
};

describe('FadeIn', () => {
  it('shows at full opacity with no animation when a screen reader is on', async () => {
    const timing = setup(false, true);
    await show();
    expect(timing).not.toHaveBeenCalled();
    expect(opacity()).toBe(1);
  });

  it('shows at full opacity with no animation when Reduce Motion is on', async () => {
    const timing = setup(true, false);
    await show();
    expect(timing).not.toHaveBeenCalled();
    expect(opacity()).toBe(1);
  });

  // #1073: a screen must never stay invisible when its fade does not finish.
  const fakeTiming = (start: (done?: (result: { finished: boolean }) => void) => void) =>
    jest.spyOn(Animated, 'timing').mockReturnValue({ start } as unknown as Animated.CompositeAnimation);

  it('ends fully shown when the fade is interrupted', async () => {
    setup(false, false);
    const reported = jest.fn();
    fakeTiming((done) => {
      reported(typeof done);
      done?.({ finished: false });
    });
    await show();
    expect(reported).toHaveBeenCalledWith('function');
    expect(opacity()).toBe(1);
  });

  it('sets full opacity even when the fade reports finished', async () => {
    setup(false, false);
    const setValue = jest.spyOn(Animated.Value.prototype, 'setValue');
    fakeTiming((done) => done?.({ finished: true }));
    await show();
    expect(setValue).toHaveBeenCalledWith(1);
    expect(opacity()).toBe(1);
  });

  it('ends fully shown when the fade never reports back, after the safety timer', async () => {
    jest.useFakeTimers();
    try {
      setup(false, false);
      fakeTiming(() => undefined);
      await show();
      expect(opacity()).toBe(0);
      await act(async () => {
        jest.advanceTimersByTime(499);
      });
      expect(opacity()).toBe(0);
      await act(async () => {
        jest.advanceTimersByTime(2);
      });
      expect(opacity()).toBe(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('ends fully shown when the app comes back to the foreground mid-fade', async () => {
    setup(false, false);
    fakeTiming(() => undefined);
    let listener: (state: string) => void = () => undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, cb: (state: string) => void) => {
      listener = cb;
      return { remove: () => undefined };
    }) as never);
    await show();
    expect(opacity()).toBe(0);
    await act(async () => listener('active'));
    expect(opacity()).toBe(1);
  });

  it('fades once, in 200 ms or less, when both are off', async () => {
    const timing = setup(false, false);
    await show();
    expect(timing).toHaveBeenCalledTimes(1);
    const config = timing.mock.calls[0]?.[1] as { duration: number; toValue: number };
    expect(config.duration).toBeLessThanOrEqual(200);
    expect(config.toValue).toBe(1);
  });
});

// True when some view in the tree paints the page colour.
const paintedPage = () =>
  screen.UNSAFE_getAllByType(View).some((v) => StyleSheet.flatten(v.props.style as never)?.backgroundColor === v2.roles.page.color);

describe('ScreenFrame', () => {
  it('draws the page glow behind the children, hidden from screen readers and ignoring touches', () => {
    render(
      <ScreenFrame>
        <Text>Hello</Text>
      </ScreenFrame>,
    );
    const glow = screen.getByTestId('page-glow', { includeHiddenElements: true });
    expect(glow.props.pointerEvents).toBe('none');
    expect(glow.props.accessible).toBe(false);
    expect(glow.props.accessibilityElementsHidden).toBe(true);
    expect(glow.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(paintedPage()).toBe(true);
    expect(screen.getByText('Hello')).toBeTruthy();
  });

  it('FadeIn paints the page colour and draws no glow of its own', async () => {
    setup(true, false);
    await show();
    expect(screen.queryByTestId('page-glow', { includeHiddenElements: true })).toBeNull();
    expect(paintedPage()).toBe(true);
  });

  it('FadeIn wrapping ScreenFrame draws exactly one glow', async () => {
    setup(true, false);
    render(
      <FadeIn>
        <ScreenFrame>
          <Text>Hello</Text>
        </ScreenFrame>
      </FadeIn>,
    );
    await act(async () => undefined);
    expect(screen.getAllByTestId('page-glow', { includeHiddenElements: true })).toHaveLength(1);
  });
});
