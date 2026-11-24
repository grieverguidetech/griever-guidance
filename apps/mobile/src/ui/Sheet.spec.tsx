import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { Modal, Platform, Text } from 'react-native';
import { act, render, screen } from '@testing-library/react-native';
import { Sheet } from './Sheet';

// #1073 (the #691 pattern): a Modal left mounted while its screen is swapped out can leave a stuck iOS window.
// The Modal exists only while the sheet is open or sliding out.

afterEach(() => {
  jest.restoreAllMocks();
});

const sheet = (visible: boolean, onDismiss?: () => void) => (
  <Sheet title="People" closeLabel="Close" visible={visible} onClose={() => undefined} onDismiss={onDismiss}>
    <Text>Body</Text>
  </Sheet>
);

const modals = () => screen.UNSAFE_queryAllByType(Modal);

describe('Sheet Modal lifetime', () => {
  it('draws no Modal while closed from the start', () => {
    render(sheet(false));
    expect(modals()).toHaveLength(0);
  });

  it('iOS: stays mounted while sliding out, and is gone once onDismiss has fired', () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const onDismiss = jest.fn();
    const view = render(sheet(true, onDismiss));
    expect(modals()).toHaveLength(1);
    view.rerender(sheet(false, onDismiss));
    expect(modals()).toHaveLength(1);
    expect(modals()[0]?.props.visible).toBe(false);
    act(() => modals()[0]?.props.onDismiss());
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(modals()).toHaveLength(0);
  });

  it('Android: no Modal as soon as the sheet closes (onDismiss never fires there)', () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const view = render(sheet(true));
    expect(modals()).toHaveLength(1);
    view.rerender(sheet(false));
    expect(modals()).toHaveLength(0);
  });

  it('opens again after closing', () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const view = render(sheet(true));
    view.rerender(sheet(false));
    act(() => modals()[0]?.props.onDismiss());
    view.rerender(sheet(true));
    expect(modals()).toHaveLength(1);
    expect(modals()[0]?.props.visible).toBe(true);
  });
});
