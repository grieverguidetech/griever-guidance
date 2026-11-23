import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { Animated, AccessibilityInfo, Text } from 'react-native';
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
} from '@testing-library/react-native';
import { Path } from 'react-native-svg';
import { useReduceMotion } from '../lib/useReduceMotion';
import {
  CONIC_WEDGES,
  SETTLE_MS,
  ConicSwirl,
  LinearSwirl,
  colorAround,
} from './Swirl';

let onChange: (on: boolean) => void = () => undefined;
let passStarts: jest.Mock;
let passStops: jest.Mock;

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
  passStarts.mockClear();
  passStops.mockClear();
  (Animated.timing as jest.Mock).mockClear();
}

beforeEach(() => {
  passStarts = jest.fn();
  passStops = jest.fn();
  jest.spyOn(Animated, 'timing').mockImplementation((() => ({
    start: passStarts,
    stop: passStops,
    reset: jest.fn(),
  })) as never);
});

afterEach(() => {
  jest.restoreAllMocks();
});

const STOPS = ['#ff0000', '#00ff00', '#0000ff'];

// A real layout pass gives the swirl its width; the test has to send it.
async function layOut(view: ReturnType<typeof render>) {
  const outer = view.getByTestId('linear-swirl-decoration', {
    includeHiddenElements: true,
  }).parent;
  await act(async () => {
    fireEvent(outer as never, 'layout', {
      nativeEvent: { layout: { width: 200, height: 48 } },
    });
  });
}

const timingConfig = (call: number) =>
  (Animated.timing as jest.Mock).mock.calls[call][1] as Record<string, unknown>;

describe('Swirl motion', () => {
  it('runs one pass of SETTLE_MS for each swirl when Reduce Motion is off', async () => {
    await givenReduceMotion(false);
    render(<ConicSwirl stops={STOPS} size={80} spinMs={9000} />);
    const linear = render(
      <LinearSwirl stops={STOPS} angle={90} driftMs={18000} />,
    );
    await layOut(linear);
    // 4500 ms (not 5000) keeps headroom under the WCAG 2.2.2 five second limit.
    expect(SETTLE_MS).toBe(4500);
    expect(Animated.timing).toHaveBeenCalledTimes(2);
    const configs = [timingConfig(0), timingConfig(1)];
    expect(configs.map((c) => c.duration)).toEqual([SETTLE_MS, SETTLE_MS]);
    expect(configs.map((c) => c.toValue).sort()).toEqual([0.25, 0.5]);
    expect(passStarts).toHaveBeenCalledTimes(2);
  });

  it('does not start the linear pass until it has a width', async () => {
    await givenReduceMotion(false);
    const view = render(
      <LinearSwirl stops={STOPS} angle={90} driftMs={4000} />,
    );
    await act(async () => undefined);
    expect(passStarts).not.toHaveBeenCalled();
    await layOut(view);
    expect(passStarts).toHaveBeenCalledTimes(1);
  });

  it('never slides past one full drift', async () => {
    await givenReduceMotion(false);
    const view = render(
      <LinearSwirl stops={STOPS} angle={90} driftMs={1000} />,
    );
    await layOut(view);
    expect(timingConfig(0)).toMatchObject({ toValue: 1 });
  });

  it('turns at most one whole turn, however fast the spin', async () => {
    await givenReduceMotion(false);
    render(<ConicSwirl stops={STOPS} size={80} spinMs={1000} />);
    await act(async () => undefined);
    expect(timingConfig(0)).toMatchObject({ toValue: 1 });
  });

  it('does not move when the speed is zero or less', async () => {
    await givenReduceMotion(false);
    const linear = render(<LinearSwirl stops={STOPS} angle={90} driftMs={0} />);
    render(<ConicSwirl stops={STOPS} size={80} spinMs={0} />);
    render(<ConicSwirl stops={STOPS} size={80} spinMs={-5} />);
    await layOut(linear);
    expect(Animated.timing).not.toHaveBeenCalled();
    expect(passStarts).not.toHaveBeenCalled();
  });

  it('starts no motion when Reduce Motion is on', async () => {
    await givenReduceMotion(true);
    const linear = render(
      <LinearSwirl stops={STOPS} angle={90} driftMs={4000} />,
    );
    render(<ConicSwirl stops={STOPS} size={80} spinMs={9000} />);
    await layOut(linear);
    expect(Animated.timing).not.toHaveBeenCalled();
    expect(passStarts).not.toHaveBeenCalled();
  });

  it('stops the pass where it is when Reduce Motion turns on while mounted', async () => {
    await givenReduceMotion(false);
    render(<ConicSwirl stops={STOPS} size={80} spinMs={9000} />);
    await act(async () => undefined);
    expect(passStarts).toHaveBeenCalledTimes(1);
    expect(passStops).not.toHaveBeenCalled();
    act(() => onChange(true));
    expect(passStops).toHaveBeenCalledTimes(1);
    expect(passStarts).toHaveBeenCalledTimes(1);
  });

  it('does not start a second pass when Reduce Motion goes on and off again', async () => {
    await givenReduceMotion(false);
    render(<ConicSwirl stops={STOPS} size={80} spinMs={9000} />);
    await act(async () => undefined);
    act(() => onChange(true));
    act(() => onChange(false));
    expect(passStarts).toHaveBeenCalledTimes(1);
  });

  it('stops the pass once on unmount', async () => {
    await givenReduceMotion(false);
    const view = render(<ConicSwirl stops={STOPS} size={80} spinMs={9000} />);
    await act(async () => undefined);
    view.unmount();
    expect(passStops).toHaveBeenCalledTimes(1);
  });

  it('does not run again when the stops or speed change', async () => {
    await givenReduceMotion(false);
    const view = render(<ConicSwirl stops={STOPS} size={80} spinMs={9000} />);
    await act(async () => undefined);
    view.rerender(
      <ConicSwirl stops={['#111111', '#222222']} size={80} spinMs={5000} />,
    );
    expect(Animated.timing).toHaveBeenCalledTimes(1);
    expect(passStarts).toHaveBeenCalledTimes(1);
  });
});

describe('ConicSwirl wedges', () => {
  it('draws one wedge per slice, coloured at the middle of the slice', async () => {
    await givenReduceMotion(true);
    render(<ConicSwirl stops={STOPS} size={80} spinMs={9000} />);
    const wedges = screen.UNSAFE_getAllByType(Path);
    expect(wedges).toHaveLength(CONIC_WEDGES);
    expect(wedges[0].props.fill).toBe(colorAround(STOPS, 0.5 / CONIC_WEDGES));
    expect(wedges[0].props.fill).toBe('#ef1000');
    expect(wedges[CONIC_WEDGES / 3].props.fill).toBe(
      colorAround(STOPS, (CONIC_WEDGES / 3 + 0.5) / CONIC_WEDGES),
    );
  });

  it("starts the first wedge at 12 o'clock", async () => {
    await givenReduceMotion(true);
    render(<ConicSwirl stops={STOPS} size={80} spinMs={9000} />);
    expect(screen.UNSAFE_getAllByType(Path)[0].props.d).toMatch(
      /^M40 40L40 0A/,
    );
  });

  it('blends the last stop back toward the first', () => {
    expect(colorAround(STOPS, 0)).toBe('#ff0000');
    expect(colorAround(STOPS, 0.5)).toBe('#008080');
    expect(colorAround(STOPS, 1 - 1 / 30)).not.toBe('#0000ff');
  });

  it('keeps a stop it cannot read as it is', () => {
    expect(colorAround(['red', '#00ff00'], 0.1)).toBe('red');
  });

  it('draws nothing when there are no stops', async () => {
    await givenReduceMotion(true);
    render(<ConicSwirl stops={[]} size={80} spinMs={9000} />);
    expect(screen.UNSAFE_queryAllByType(Path)).toHaveLength(0);
  });
});

describe('Swirl for screen readers', () => {
  it('hides the linear decoration layer and ignores touches', async () => {
    await givenReduceMotion(true);
    const view = render(
      <LinearSwirl stops={STOPS} angle={45} driftMs={4000} />,
    );
    const layer = view.getByTestId('linear-swirl-decoration', {
      includeHiddenElements: true,
    });
    expect(layer.props.accessible).toBe(false);
    expect(layer.props.accessibilityElementsHidden).toBe(true);
    expect(layer.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(layer.props.pointerEvents).toBe('none');
  });

  it('hides the conic swirl and ignores touches', async () => {
    await givenReduceMotion(true);
    const view = render(
      <ConicSwirl stops={STOPS} size={80} spinMs={9000} testID="conic" />,
    );
    const root = view.getByTestId('conic', { includeHiddenElements: true });
    expect(root.props.accessible).toBe(false);
    expect(root.props.accessibilityElementsHidden).toBe(true);
    expect(root.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(root.props.pointerEvents).toBe('none');
  });

  it('keeps a labelled child inside LinearSwirl readable', async () => {
    await givenReduceMotion(true);
    const view = render(
      <LinearSwirl stops={STOPS} angle={90} driftMs={4000}>
        <Text accessibilityLabel="Send note" accessibilityRole="button">
          Send
        </Text>
      </LinearSwirl>,
    );
    expect(view.getByLabelText('Send note')).toBeTruthy();
    expect(view.getByRole('button', { name: 'Send note' })).toBeTruthy();
  });
});
