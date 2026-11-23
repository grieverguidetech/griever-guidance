import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { Animated, AccessibilityInfo } from 'react-native';
import { act, render, renderHook, screen } from '@testing-library/react-native';
import { Path } from 'react-native-svg';
import { useReduceMotion } from '../lib/useReduceMotion';
import { CONIC_WEDGES, ConicSwirl, LinearSwirl, colorAround } from './Swirl';

let onChange: (on: boolean) => void = () => undefined;
let loopStarts: jest.Mock;
let loopStops: jest.Mock;

// The hook remembers the last answer between renders, so settle it first; otherwise an earlier
// test's answer leaks into the first render of the next one.
async function givenReduceMotion(on: boolean) {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(on);
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((
    name: string,
    handler: (on: boolean) => void,
  ) => {
    if (name === 'reduceMotionChanged') {
      onChange = handler;
    }
    return { remove: () => undefined };
  }) as never);
  const primer = renderHook(() => useReduceMotion());
  await act(async () => undefined);
  primer.unmount();
  loopStarts.mockClear();
  loopStops.mockClear();
  (Animated.loop as jest.Mock).mockClear();
}

beforeEach(() => {
  loopStarts = jest.fn();
  loopStops = jest.fn();
  jest.spyOn(Animated, 'loop').mockImplementation((() => ({
    start: loopStarts,
    stop: loopStops,
    reset: jest.fn(),
  })) as never);
});

afterEach(() => {
  jest.restoreAllMocks();
});

const STOPS = ['#ff0000', '#00ff00', '#0000ff'];

describe('Swirl motion', () => {
  it('starts one loop for each swirl when Reduce Motion is off', async () => {
    await givenReduceMotion(false);
    render(<LinearSwirl stops={STOPS} angle={90} driftMs={4000} />);
    render(<ConicSwirl stops={STOPS} size={80} spinMs={9000} />);
    await act(async () => undefined);
    expect(Animated.loop).toHaveBeenCalledTimes(2);
    expect(loopStarts).toHaveBeenCalledTimes(2);
  });

  it('starts no loop when Reduce Motion is on', async () => {
    await givenReduceMotion(true);
    render(<LinearSwirl stops={STOPS} angle={90} driftMs={4000} />);
    render(<ConicSwirl stops={STOPS} size={80} spinMs={9000} />);
    await act(async () => undefined);
    expect(Animated.loop).not.toHaveBeenCalled();
    expect(loopStarts).not.toHaveBeenCalled();
  });

  it('stops the running loop when Reduce Motion turns on while mounted', async () => {
    await givenReduceMotion(false);
    render(<ConicSwirl stops={STOPS} size={80} spinMs={9000} />);
    await act(async () => undefined);
    expect(loopStarts).toHaveBeenCalledTimes(1);
    expect(loopStops).not.toHaveBeenCalled();
    act(() => onChange(true));
    expect(loopStops).toHaveBeenCalledTimes(1);
    expect(loopStarts).toHaveBeenCalledTimes(1);
  });
});

describe('ConicSwirl wedges', () => {
  it('draws one wedge per slice, the first in the first stop', async () => {
    await givenReduceMotion(true);
    render(<ConicSwirl stops={STOPS} size={80} spinMs={9000} />);
    const wedges = screen.UNSAFE_getAllByType(Path);
    expect(wedges).toHaveLength(CONIC_WEDGES);
    expect(wedges[0].props.fill).toBe('#ff0000');
    expect(wedges[CONIC_WEDGES / 3].props.fill).toBe('#00ff00');
    expect(wedges[(2 * CONIC_WEDGES) / 3].props.fill).toBe('#0000ff');
  });

  it('blends the last stop back toward the first', () => {
    expect(colorAround(STOPS, 0)).toBe('#ff0000');
    expect(colorAround(STOPS, 0.5)).toBe('#008080');
    expect(colorAround(STOPS, 1 - 1 / 30)).not.toBe('#0000ff');
  });

  it('keeps a stop it cannot read as it is', () => {
    expect(colorAround(['red', '#00ff00'], 0.1)).toBe('red');
  });
});

describe('Swirl for screen readers', () => {
  it('hides both swirls and their children', async () => {
    await givenReduceMotion(true);
    render(<LinearSwirl stops={STOPS} angle={45} driftMs={4000} />);
    render(<ConicSwirl stops={STOPS} size={80} spinMs={9000} />);
    const hidden = [screen.UNSAFE_getAllByProps({ accessible: false })].flat();
    expect(hidden.length).toBeGreaterThan(0);
    const roots = screen.UNSAFE_getAllByProps({
      importantForAccessibility: 'no-hide-descendants',
    });
    expect(roots.length).toBeGreaterThanOrEqual(2);
    for (const root of roots) {
      expect(root.props.accessible).toBe(false);
      expect(root.props.accessibilityElementsHidden).toBe(true);
    }
  });
});
