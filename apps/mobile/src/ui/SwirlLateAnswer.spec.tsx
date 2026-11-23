import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { AccessibilityInfo } from 'react-native';
import { render } from '@testing-library/react-native';
import { ConicSwirl, LinearSwirl } from './Swirl';

// Its own file: the Reduce Motion hook remembers its last answer per module registry, and this
// needs the first answer ("off") to arrive after the first render, as it does on a slow runner.
afterEach(() => {
  jest.restoreAllMocks();
});

describe('Swirl and a late Reduce Motion answer', () => {
  it('makes no state update outside act when the phone answers after the render', async () => {
    let answer: (on: boolean) => void = () => undefined;
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockReturnValue(
      new Promise<boolean>((resolve) => {
        answer = resolve;
      }),
    );
    const errors = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <>
        <LinearSwirl stops={['#ff0000', '#00ff00']} angle={90} driftMs={4000} />
        <ConicSwirl stops={['#ff0000', '#00ff00']} size={22} spinMs={9000} />
      </>,
    );
    answer(false);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const actWarnings = errors.mock.calls.filter((call) => String(call[0]).includes('not wrapped in act'));
    expect(actWarnings).toHaveLength(0);
  });
});
