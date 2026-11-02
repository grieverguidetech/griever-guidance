import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { AccessibilityInfo } from 'react-native';
import { act, renderHook } from '@testing-library/react-native';
import { FADE_MS, screenTransition, useReduceMotion } from './useReduceMotion';

afterEach(() => {
  jest.restoreAllMocks();
});

describe('screenTransition', () => {
  it('is one fade of 200 ms or less, never a slide', () => {
    const options = screenTransition(false);
    expect(options.animation).toBe('fade');
    expect(FADE_MS).toBeLessThanOrEqual(200);
    expect(options).toEqual({ animation: 'fade', animationDuration: FADE_MS });
  });

  it('is no animation at all when Reduce Motion is on', () => {
    expect(screenTransition(true)).toEqual({ animation: 'none' });
  });
});

describe('useReduceMotion', () => {
  it('follows the phone setting and its change event', async () => {
    let onChange: (on: boolean) => void = () => undefined;
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((name: string, handler: (on: boolean) => void) => {
      if (name === 'reduceMotionChanged') {
        onChange = handler;
      }
      return { remove: () => undefined };
    }) as never);
    const { result } = renderHook(() => useReduceMotion());
    await act(async () => undefined);
    expect(result.current).toBe(false);
    act(() => onChange(true));
    expect(result.current).toBe(true);
  });
});
