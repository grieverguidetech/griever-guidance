import { describe, expect, it, jest } from '@jest/globals';
import { Modal } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CHECKLIST_KEY } from '../screens/WhatYoullNeedScreen';
import { SetupScreen } from '../screens/SetupScreen';

jest.mock('react-native/Libraries/ReactNative/RendererProxy', () => ({
  ...jest.requireActual<object>('react-native/Libraries/ReactNative/RendererProxy'),
  findNodeHandle: () => 1,
}));

const setup = () => render(<SetupScreen initial={{ personName: '', dateOfPassing: '' }} onContinue={jest.fn()} onBack={jest.fn()} />);
const open = () => fireEvent.press(screen.getByRole('button', { name: "What you'll need" }));

describe('What you will need sheet (#193)', () => {
  it('is closed until the button is pressed, then shows the checklist as a modal', async () => {
    setup();
    expect(screen.UNSAFE_getByType(Modal).props.visible).toBe(false);
    open();
    expect(screen.UNSAFE_getByType(Modal).props.visible).toBe(true);
    expect(await screen.findAllByRole('checkbox')).toHaveLength(5);
    expect(screen.UNSAFE_getByProps({ accessibilityViewIsModal: true })).toBeTruthy();
  });

  it('closes with the Close button and keeps what was typed', async () => {
    setup();
    fireEvent.changeText(screen.getByLabelText('Their name, required'), 'Anna Lee');
    open();
    await screen.findAllByRole('checkbox');
    fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(screen.UNSAFE_getByType(Modal).props.visible).toBe(false);
    expect(screen.getByLabelText('Their name, required').props.value).toBe('Anna Lee');
  });

  it('closes on the Android Back gesture (onRequestClose)', async () => {
    setup();
    open();
    await screen.findAllByRole('checkbox');
    act(() => screen.UNSAFE_getByType(Modal).props.onRequestClose());
    expect(screen.UNSAFE_getByType(Modal).props.visible).toBe(false);
  });

  it('ticks use the same saved list as the checklist screen', async () => {
    await AsyncStorage.setItem(CHECKLIST_KEY, '["insurance"]');
    setup();
    open();
    const row = await screen.findByRole('checkbox', { name: /^Life insurance policies/ });
    expect(row.props.accessibilityState).toEqual({ checked: true });
    await AsyncStorage.removeItem(CHECKLIST_KEY);
  });
});
