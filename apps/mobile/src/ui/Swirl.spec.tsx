import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { Animated, AccessibilityInfo, Text } from 'react-native';
import { act, render, renderHook, screen } from '@testing-library/react-native';
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
  jest
    .spyOn(Animated, 'timing')
    .mockImplementation((() => ({
      start: passStarts,
      stop: passStops,
      reset: jest.fn(),
    })) as never);
});

afterEach(() => {
  jest.restoreAllMocks();
});

const STOPS = ['#ff0000', '#00ff00', '#0000ff'];

describe('Swirl motion', () => {
  it('runs one pass of SETTLE_MS for each swirl when Reduce Motion is off', async () => {
    await givenReduceMotion(false);
    render(<LinearSwirl stops={STOPS} angle={90} driftMs={20000} />);
    render(<ConicSwirl stops={STOPS} size={80} spinMs={10000} />);
    await act(async () => undefined);
    expect(SETTLE_MS).toBe(5000);
    expect(Animated.timing).toHaveBeenCalledTimes(2);
    const [linear, conic] = (Animated.timing as jest.Mock).mock.calls.map(
      (call) => call[1] as Record<string, unknown>,
    );
    expect(linear).toMatchObject({ duration: SETTLE_MS, toValue: 0.25 });
    expect(conic).toMatchObject({ duration: SETTLE_MS, toValue: 0.5 });
    expect(passStarts).toHaveBeenCalledTimes(2);
  });

  it('never slides past one full drift', async () => {
    await givenReduceMotion(false);
    render(<LinearSwirl stops={STOPS} angle={90} driftMs={1000} />);
    await act(async () => undefined);
    expect((Animated.timing as jest.Mock).mock.calls[0][1]).toMatchObject({
      toValue: 1,
    });
  });

  it('starts no motion when Reduce Motion is on', async () => {
    await givenReduceMotion(true);
    render(<LinearSwirl stops={STOPS} angle={90} driftMs={4000} />);
    render(<ConicSwirl stops={STOPS} size={80} spinMs={9000} />);
    await act(async () => undefined);
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
