import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { AccessibilityInfo, Animated, Text } from 'react-native';
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

  it('fades once, in 200 ms or less, when both are off', async () => {
    const timing = setup(false, false);
    await show();
    expect(timing).toHaveBeenCalledTimes(1);
    const config = timing.mock.calls[0]?.[1] as { duration: number; toValue: number };
    expect(config.duration).toBeLessThanOrEqual(200);
    expect(config.toValue).toBe(1);
  });
});

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
    const root = screen.toJSON() as { props: { style: { backgroundColor?: string } }; children: { props: { testID?: string } | null }[] };
    expect(root.props.style.backgroundColor).toBe(v2.roles.page.color);
    expect(root.children[0]?.props?.testID).toBe('page-glow');
    expect(screen.getByText('Hello')).toBeTruthy();
  });
});
