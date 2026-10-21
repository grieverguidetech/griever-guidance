import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { AccessibilityInfo, Modal } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CHECKLIST_KEY, SSN_TIP } from '../screens/WhatYoullNeedScreen';
import { SetupScreen } from '../screens/SetupScreen';

// Jest has no native view tree, so findNodeHandle returns null and the focus calls would be skipped.
// A fake handle lets the tests see that focus is sent to the right place.
// This path is specific to react-native 0.81 (Expo SDK 54). Re-check it when react-native is upgraded.
jest.mock('react-native/Libraries/ReactNative/RendererProxy', () => ({
  ...jest.requireActual<object>('react-native/Libraries/ReactNative/RendererProxy'),
  findNodeHandle: () => 1,
}));

const setup = () => render(<SetupScreen initial={{ personName: '', dateOfPassing: '' }} onContinue={jest.fn()} onBack={jest.fn()} />);
const open = () => fireEvent.press(screen.getByRole('button', { name: "What you'll need" }));
const modal = () => screen.UNSAFE_getByType(Modal);

describe('What you will need sheet (#193)', () => {
  // Runs even when a test fails, so saved ticks never leak into the next test.
  afterEach(async () => {
    jest.restoreAllMocks();
    await AsyncStorage.removeItem(CHECKLIST_KEY);
  });

  it('is closed until the button is pressed, then shows the checklist as a modal', async () => {
    setup();
    expect(modal().props.visible).toBe(false);
    open();
    expect(modal().props.visible).toBe(true);
    expect(await screen.findAllByRole('checkbox')).toHaveLength(5);
    expect(screen.UNSAFE_getByProps({ accessibilityViewIsModal: true })).toBeTruthy();
  });

  it('closes with the Close button and keeps what was typed', async () => {
    setup();
    fireEvent.changeText(screen.getByLabelText('Their name, required'), 'Anna Lee');
    open();
    await screen.findAllByRole('checkbox');
    fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(modal().props.visible).toBe(false);
    expect(screen.getByLabelText('Their name, required').props.value).toBe('Anna Lee');
  });

  it('closes on the Android Back gesture (onRequestClose)', async () => {
    setup();
    open();
    await screen.findAllByRole('checkbox');
    act(() => modal().props.onRequestClose());
    expect(modal().props.visible).toBe(false);
  });

  it('closes on the screen-reader escape gesture and on a tap on the dimmed area', async () => {
    setup();
    open();
    await screen.findAllByRole('checkbox');
    act(() => screen.UNSAFE_getByProps({ accessibilityViewIsModal: true }).props.onAccessibilityEscape());
    expect(modal().props.visible).toBe(false);
    open();
    await screen.findAllByRole('checkbox');
    fireEvent.press(screen.UNSAFE_getByProps({ importantForAccessibility: 'no' }));
    expect(modal().props.visible).toBe(false);
  });

  it('Back closes an open tip first, then the sheet; a touch in the sheet closes the tip', async () => {
    setup();
    open();
    await screen.findAllByRole('checkbox');
    fireEvent.press(screen.getByRole('button', { name: 'Why we list this' }));
    expect(screen.getByText(SSN_TIP)).toBeTruthy();
    act(() => modal().props.onRequestClose());
    expect(screen.queryByText(SSN_TIP)).toBeNull();
    expect(modal().props.visible).toBe(true);
    fireEvent.press(screen.getByRole('button', { name: 'Why we list this' }));
    fireEvent(screen.getByText('Not today. Just so none of it surprises you.'), 'touchStart');
    expect(screen.queryByText(SSN_TIP)).toBeNull();
    act(() => modal().props.onRequestClose());
    expect(modal().props.visible).toBe(false);
  });

  it('sends screen-reader focus to the title when shown and to the button when dismissed', async () => {
    const focus = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus').mockImplementation(() => undefined);
    setup();
    focus.mockClear();
    open();
    await screen.findAllByRole('checkbox');
    act(() => modal().props.onShow());
    expect(focus).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    focus.mockClear();
    act(() => modal().props.onDismiss());
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it('skips the slide when Reduce Motion is on', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    setup();
    await waitFor(() => expect(modal().props.animationType).toBe('none'));
  });

  it('slides in by default', () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    setup();
    expect(modal().props.animationType).toBe('slide');
  });

  it('shows ticks from the saved list, and a tap saves to the same list', async () => {
    await AsyncStorage.setItem(CHECKLIST_KEY, '["insurance"]');
    setup();
    open();
    const row = await screen.findByRole('checkbox', { name: /^Life insurance policies/ });
    expect(row.props.accessibilityState).toEqual({ checked: true });
    fireEvent.press(screen.getByRole('checkbox', { name: /^Military discharge papers/ }));
    await waitFor(async () => expect(await AsyncStorage.getItem(CHECKLIST_KEY)).toBe('["insurance","military"]'));
  });
});
