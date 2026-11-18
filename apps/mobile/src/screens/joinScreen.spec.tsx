import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Platform, ScrollView } from 'react-native';
import { JoinScreen } from './JoinScreen';
import type { JoinPhase } from './JoinScreen';

// Jest has no native view tree, so findNodeHandle returns null; focus needs a handle.
jest.mock('react-native/Libraries/ReactNative/RendererProxy', () => ({
  ...jest.requireActual<object>('react-native/Libraries/ReactNative/RendererProxy'),
  findNodeHandle: () => 1,
}));

const nextTick = () => act(async () => new Promise((resolve) => setTimeout(resolve, 80)));
const noop = () => undefined;
const view = (phase: JoinPhase) => <JoinScreen phase={phase} onCreateAccount={noop} onSignIn={noop} onContinue={noop} />;

const replaced: { restore: () => void }[] = [];
afterEach(() => {
  replaced.splice(0).forEach((r) => r.restore());
  jest.restoreAllMocks();
});

describe('JoinScreen accessibility', () => {
  it('every phase with a heading has it as a header, and focus moves to it on each phase change', async () => {
    const focus = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus').mockImplementation(() => undefined);
    focus.mockClear();
    const { rerender } = render(view('invited'));
    await nextTick();
    expect(screen.getByRole('heading', { name: "You've been asked to help" })).toBeTruthy();
    expect(screen.getByRole('heading').props.accessibilityRole).toBe('header');
    expect(focus).toHaveBeenCalledTimes(1);
    for (const [index, phase] of (['unusable', 'conflict', 'offline', 'later'] as const).entries()) {
      rerender(view(phase));
      await nextTick();
      expect(screen.getAllByRole('heading')).toHaveLength(1);
      expect(focus).toHaveBeenCalledTimes(index + 2);
    }
  });

  it('wraps the content in a ScrollView so it fits at the largest text size', () => {
    render(view('invited'));
    expect(screen.UNSAFE_getByType(ScrollView)).toBeTruthy();
  });

  it('Joining… is a polite live region and is announced on iOS', async () => {
    replaced.push(jest.replaceProperty(Platform, 'OS', 'ios'));
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
    // The spy can be the one an earlier test made, so count from here.
    announce.mockClear();
    render(view('joining'));
    const line = await screen.findByText('Joining…');
    expect(line.props.accessibilityLiveRegion).toBe('polite');
    expect(announce).toHaveBeenCalledWith('Joining…');
    expect(announce).toHaveBeenCalledTimes(1);
  });

  it('does not announce Joining… on Android, where the live region is read', async () => {
    replaced.push(jest.replaceProperty(Platform, 'OS', 'android'));
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
    // The spy can be the one an earlier test made, so count from here.
    announce.mockClear();
    render(view('joining'));
    await screen.findByText('Joining…');
    expect(announce).not.toHaveBeenCalled();
  });
});
